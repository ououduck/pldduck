/**
 * friend-backlink-audit.mjs — 友链反链巡检（**只读**）。
 *
 * 逐个检查 friends/ 里的站点是否仍挂着指向本站的反链：
 *   静态抓取 → 没命中且页面可达时用无头浏览器渲染兜底 → 汇总「未检测到」与「无法判定」
 *   的站点推送到飞书。
 *
 * 不写仓库、不改 Issue、不触发部署；结论只用于提醒站长，不自动下架任何友链
 * （下架仍在 Pages CMS 人工处理，见 ai-rules/friends.md）。
 *
 * 本地调试：
 *   node scripts/friend-backlink-audit.mjs --dry-run --print
 *   node scripts/friend-backlink-audit.mjs --dry-run --print --limit 3
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnvNumber } from './lib/env.mjs';
import { sendFeishuWebhookMessage } from './lib/feishu-webhook.mjs';
import {
  createActionLogger,
  formatError,
  installGlobalErrorHandlers,
  sanitizeLogValue,
} from './lib/gh-actions-logger.mjs';
import { sanitizeUrlForLogs } from './lib/http.mjs';
import { buildAcceptedHosts, findBacklink, findBacklinkInAnchors } from './lib/friend-backlink.mjs';
import { createPageFetcher } from './lib/friend-page-fetch.mjs';
import { renderPage } from './lib/render-html.mjs';
import { FRIENDS_DIR } from './lib/friend-form-core.mjs';
import {
  BACKLINK_AUDIT_STATUS,
  classifyAuditVerdict,
  renderAuditFeishuText,
  summariseAudit,
} from './lib/friend-backlink-audit-core.mjs';
import { loadSiteConfig } from './site-config-loader.mjs';

const logger = createActionLogger('friend-backlink-audit');
installGlobalErrorHandlers(logger);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const readArg = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};

/** DRY_RUN：不推飞书（本地调试/复核用），其余行为不变。 */
const DRY_RUN = hasFlag('dry-run') || String(process.env.FRIEND_AUDIT_DRY_RUN || '').toLowerCase() === 'true';
const PRINT = hasFlag('print');
const LIMIT = parseEnvNumber(readArg('limit') || process.env.FRIEND_AUDIT_LIMIT, 0);

const REQUEST_TIMEOUT_MS = parseEnvNumber(process.env.FRIEND_AUDIT_TIMEOUT_MS, 20000);
const RENDER_TIMEOUT_MS = parseEnvNumber(process.env.FRIEND_AUDIT_RENDER_TIMEOUT_MS, 25000);
/** 一轮巡检的渲染总预算：友链多时避免把 30 分钟的 job 拖满。 */
const RENDER_BUDGET_MS = parseEnvNumber(process.env.FRIEND_AUDIT_RENDER_BUDGET_MS, 15 * 60 * 1000);

const siteConfig = loadSiteConfig({ logger });
const SITE_URL = siteConfig.url;
const ACCEPTED_HOSTS = buildAcceptedHosts(SITE_URL);
const fetchHtml = createPageFetcher({ timeoutMs: REQUEST_TIMEOUT_MS });

/** 读 friends/*.json（跳过已失联的站点：那是 B 道巡检的职责）。 */
const readFriends = () => {
  const dir = path.join(ROOT_DIR, FRIENDS_DIR);
  if (!fs.existsSync(dir)) {
    logger.warn(`friends 目录不存在：${FRIENDS_DIR}`);
    return [];
  }
  const records = [];
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (typeof data?.url !== 'string' || !data.url.trim()) {
        logger.warn('友链记录缺少 url，跳过', { file });
        continue;
      }
      if (data.unavailable === true) continue;
      records.push({ filename: file, ...data });
    } catch (error) {
      logger.warn('友链记录解析失败，跳过', { file, error: formatError(error) });
    }
  }
  return LIMIT > 0 ? records.slice(0, LIMIT) : records;
};

/**
 * 检查单条友链：静态 → 渲染兜底 → 分类。
 * @param {{ name?: string, url: string, filename: string }} friend
 * @param {{ deadline: number }} budget
 * @returns {Promise<object>}
 */
const checkFriend = async (friend, budget) => {
  const name = sanitizeLogValue(friend.name || friend.filename);
  let host = friend.url;
  try {
    host = new URL(friend.url).hostname;
  } catch {
    // 保留原始 url 作为展示
  }

  const fetched = await fetchHtml(friend.url);
  if (fetched.transport) {
    return {
      name,
      host,
      status: BACKLINK_AUDIT_STATUS.UNCERTAIN,
      reason: fetched.transport.message,
      method: '静态',
    };
  }

  let result = findBacklink({
    html: fetched.html,
    pageUrl: friend.url,
    finalUrl: fetched.finalUrl,
    claimedUrl: friend.url,
    acceptedHosts: ACCEPTED_HOSTS,
    truncated: fetched.truncated,
  });
  let method = '静态';
  let renderedOk = false;

  if (result.verdict === 'not-found' || result.verdict === 'js-only') {
    if (Date.now() > budget.deadline) {
      logger.warn('渲染总预算用尽，跳过渲染兜底', { url: sanitizeUrlForLogs(friend.url) });
    } else {
      const rendered = await renderPage(friend.url, { timeoutMs: RENDER_TIMEOUT_MS });
      if (rendered.error) {
        logger.warn('渲染兜底失败，沿用静态结论', {
          url: sanitizeUrlForLogs(friend.url),
          error: sanitizeLogValue(rendered.error),
        });
      } else if (rendered.status >= 400) {
        logger.warn('渲染兜底拿到错误状态码，沿用静态结论', {
          url: sanitizeUrlForLogs(friend.url),
          status: rendered.status,
        });
      } else {
        renderedOk = true;
        method = '静态 + 渲染';
        result = findBacklinkInAnchors({
          anchors: rendered.anchors,
          pageUrl: friend.url,
          finalUrl: rendered.finalUrl,
          claimedUrl: friend.url,
          acceptedHosts: ACCEPTED_HOSTS,
          rendered: true,
          frames: rendered.frames,
        });
      }
    }
  }

  let classified = classifyAuditVerdict(result);
  // 静态页面里一个 <a> 都没有、渲染又没成功：不能断言「没挂链」，归入无法判定。
  if (!renderedOk && result.verdict === 'js-only') {
    classified = {
      status: BACKLINK_AUDIT_STATUS.UNCERTAIN,
      reason: '静态页面没有 <a>，渲染兜底未成功（可能被墙/反爬或超预算）',
    };
  }

  return { name, host, ...classified, method, verdict: result.verdict };
};

const tableRows = (records) =>
  records.map((record) => ({
    站点: record.name,
    域名: record.host,
    结论: record.status,
    方式: record.method,
    说明: record.reason || '',
  }));

const today = () => new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

const main = async () => {
  const friends = readFriends();
  if (friends.length === 0) {
    logger.info('没有可巡检的友链记录');
    return 0;
  }

  logger.info('开始友链反链巡检', {
    sites: friends.length,
    site: sanitizeUrlForLogs(SITE_URL),
    renderBudgetMs: RENDER_BUDGET_MS,
  });

  const budget = { deadline: Date.now() + RENDER_BUDGET_MS };
  const records = [];
  for (const friend of friends) {
    const record = await checkFriend(friend, budget);
    records.push(record);
    logger.info('巡检完成一条', {
      site: record.name,
      host: record.host,
      status: record.status,
      method: record.method,
    });
  }

  const summary = summariseAudit(records);
  logger.summaryTable('友链反链巡检', tableRows(records));
  if (PRINT) {
    console.log(`\n----- 巡检记录 -----\n${JSON.stringify(records, null, 2)}\n`);
  }
  logger.info('巡检汇总', {
    checked: summary.checked,
    ok: summary.ok,
    missing: summary.missing.length,
    uncertain: summary.uncertain.length,
  });

  // 全部正常时不发飞书，避免每天一条「一切正常」的噪音；需要常报可设 FRIEND_AUDIT_ALWAYS_NOTIFY=1。
  const alwaysNotify = String(process.env.FRIEND_AUDIT_ALWAYS_NOTIFY || '').toLowerCase() === 'true';
  if (summary.missing.length === 0 && summary.uncertain.length === 0 && !alwaysNotify) {
    logger.info('全部友链均检测到反链，本轮不推飞书');
    return 0;
  }

  const { text } = renderAuditFeishuText({ records, date: today() });
  if (DRY_RUN) {
    logger.info('DRY_RUN：跳过飞书通知');
    if (PRINT) console.log(`\n----- 飞书正文 -----\n${text}\n`);
    return 0;
  }

  try {
    await sendFeishuWebhookMessage(text, { event: 'friend-backlink-audit', title: '🔗 pldduck 友链反链巡检' });
    logger.info('飞书巡检报告已发送');
  } catch (error) {
    logger.error('飞书通知发送失败（巡检为只读，不影响仓库）', { error: formatError(error) });
    return 1;
  }
  return 0;
};

// 只有作为主模块直接运行时才执行：被测试或其他脚本 import 时不得有副作用（真实网络请求）。
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    process.exitCode = await main();
  } catch (error) {
    logger.error('friend-backlink-audit failed', formatError(error));
    process.exitCode = 1;
  }
}
