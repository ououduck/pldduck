/**
 * friend-link-check.mjs — 友链 Issue 申请的处理入口（检测取证 / 人工标签入库 / 拒绝）。
 *
 * 分工：判定与校验的一切细节都在 scripts/lib/friend-backlink.mjs 与
 * scripts/lib/friend-form-core.mjs（纯函数、有单测），本文件只做三件事：
 * 读事件载荷、发网络请求、调 GitHub REST。
 *
 * 铁律（见 ai-rules/friends.md 规则 3/5/6）：
 *   - 自动检测只产出证据，**只有站长的 friend-approved 标签会写文件**；
 *     唯一的自动结论是「站点/头像在境外确认打不开」→ 自动驳回并关闭（不写文件，
 *     站长想放过就重开 Issue 再打 friend-approved）；
 *   - GITHUB_TOKEN 的 push 不触发任何 workflow，所以记录校验必须在写入之前完成，
 *     收录通知与部署都要机器人自己发（workflow_dispatch 自 2022-09 起允许 GITHUB_TOKEN 调用）；
 *   - 写入目录硬编码 friends/，文件名只从 issue 提交者 login 派生，一次只动一个文件。
 *   - 反链检测静态优先：静态 HTML 没命中、且页面确实抓到了，才用无头浏览器渲染一次（JS 挂件）；
 *     渲染失败/超时/被拦一律退回静态结论，绝不当成「没挂链」。
 *
 * 本地调试（不出网也能跑字节级判定）：
 *   node scripts/friend-link-check.mjs --fixture page.html --url https://blog.example/links --print
 *   node scripts/friend-link-check.mjs --check-url https://blog.example --print
 *   node scripts/friend-link-check.mjs --check-url https://blog.example --site https://blog.example --render
 *   GITHUB_EVENT_NAME=issues GITHUB_EVENT_PATH=event.json GITHUB_TOKEN=… node scripts/friend-link-check.mjs --dry-run
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
import {
  fetchWithRetry,
  getSafeFetchAgent,
  isSafePublicHttpUrl,
  readResponseBytesLimited,
  RetryableHttpError,
  sanitizeUrlForLogs,
} from './lib/http.mjs';
import {
  BACKLINK_VERDICTS,
  RESTRICTED_STATUS_CODES,
  buildAcceptedHosts,
  buildTransportVerdict,
  classifyReachability,
  decodeHtmlBytes,
  findBacklink,
  findBacklinkInAnchors,
} from './lib/friend-backlink.mjs';
import { renderPage } from './lib/render-html.mjs';
import {
  FRIEND_ISSUE_MARKER,
  FRIENDS_DIR,
  REJECT_CONTACT_EMAIL,
  buildRecordJson,
  mergeRecordJson,
  normalizeFriendUrl,
  parseFriendIssueBody,
  pickDetectionUrl,
  looksLikeFriendApplication,
  renderApprovedComment,
  renderBlockedComment,
  renderDetectComment,
  renderRejectComment,
  renderUnreachableComment,
  suggestFilename,
  validateFriendRecord,
} from './lib/friend-form-core.mjs';
import { loadSiteConfig } from './site-config-loader.mjs';
import { createRepoClient } from './lib/friend-repo-io.mjs';

const logger = createActionLogger('friend-link');
installGlobalErrorHandlers(logger);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ */
/* 可调参数与运行模式                                                   */
/* ------------------------------------------------------------------ */

/** 单次抓取超时（毫秒）：友链页面多在慢速虚机上，12s 会误判成「没挂链」。 */
const REQUEST_TIMEOUT_MS = parseEnvNumber(process.env.FRIEND_CHECK_TIMEOUT_MS, 20000);
/** 响应体上限：挂件常在页脚，512 KB 会截断真实页面；截断会在评论里如实说明。 */
const MAX_RESPONSE_BYTES = parseEnvNumber(process.env.FRIEND_MAX_RESPONSE_BYTES, 1024 * 1024);
const MAX_REDIRECTS = parseEnvNumber(process.env.FRIEND_MAX_REDIRECTS, 5);
const REQUEST_RETRIES = 1;

/**
 * 渲染兜底：静态 HTML 里没命中时，用无头浏览器再取证一次（JS 挂件/接口拉数据的友链）。
 * 默认开启；没装浏览器时 renderPage 自己返回 error，检测照旧退回静态结论。
 * 只有「静态拿到了 HTML 但没命中」才会触发 —— 静态都打不开的站点不值得再花 25 秒。
 */
const RENDER_FALLBACK_ENABLED = !['0', 'false', 'no'].includes(
  String(process.env.FRIEND_RENDER_FALLBACK || '1').toLowerCase(),
);
/** 单次渲染超时 + 一轮检测的渲染总预算（两个候选页顶多各一次）。 */
const RENDER_TIMEOUT_MS = parseEnvNumber(process.env.FRIEND_RENDER_TIMEOUT_MS, 25000);
const RENDER_BUDGET_MS = parseEnvNumber(process.env.FRIEND_RENDER_BUDGET_MS, 60000);

const DEPLOY_WORKFLOW = 'deploy.yml';

const LABELS = Object.freeze({
  link: 'friend-link',
  ok: 'friend-backlink-ok',
  missing: 'friend-backlink-missing',
  needsInfo: 'friend-needs-info',
  unreachable: 'friend-unreachable',
  approved: 'friend-approved',
  rejected: 'friend-rejected',
  added: 'friend-added',
});
/** 互斥的结论标签：机器人自己摘放，人工标签（approved/rejected）永不触碰。 */
const DETECTION_LABELS = [LABELS.ok, LABELS.missing, LABELS.needsInfo, LABELS.unreachable];

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const readArg = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};

const DRY_RUN = hasFlag('dry-run');
const PRINT = hasFlag('print');

const siteConfig = loadSiteConfig({ logger });
const SITE_URL = siteConfig.url;
const ACCEPTED_HOSTS = buildAcceptedHosts(SITE_URL);

/* ------------------------------------------------------------------ */
/* GitHub REST 最小客户端                                               */
/* ------------------------------------------------------------------ */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPOSITORY = process.env.GITHUB_REPOSITORY || '';
const [OWNER, REPO] = REPOSITORY.split('/');

/**
 * GitHub REST 客户端（读文件/写文件/dispatch 的实现在 lib/friend-repo-io，与失联巡检共用）。
 * 错误信息里只保留状态与 API 文案，不带 token、不带响应体全文。
 */
const repoClient = createRepoClient({ token: GITHUB_TOKEN, owner: OWNER, repo: REPO, logger });
const githubRequest = repoClient.request;

const issueEndpoint = (number, suffix = '') => `/repos/${OWNER}/${REPO}/issues/${number}${suffix}`;

/** 发机器人评论（--dry-run/--print 时只打印）。 */
const postComment = async (number, body) => {
  if (DRY_RUN) {
    logger.info('DRY_RUN: 跳过发表评论', { issue: number });
    if (PRINT) console.log(`\n----- 评论正文 -----\n${body}\n`);
    return;
  }
  await githubRequest('POST', issueEndpoint(number, '/comments'), { body: { body } });
};

/** 打标签（已存在时 GitHub 幂等返回）。 */
const addLabels = async (number, labels) => {
  if (DRY_RUN) {
    logger.info('DRY_RUN: 跳过打标签', { issue: number, labels: labels.join(',') });
    return;
  }
  await githubRequest('POST', issueEndpoint(number, '/labels'), { body: { labels } });
};

/**
 * 检测结论标签互斥：去掉与本次结论不同的旧检测标签，避免「既 ok 又 missing」。
 * 只动我们自己打的三个标签，人工标签（approved/rejected）永不触碰。
 */
const syncDetectionLabel = async (issue, wanted) => {
  const present = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
  const stale = present.filter((name) => DETECTION_LABELS.includes(name) && name !== wanted);
  for (const name of stale) {
    if (DRY_RUN) {
      logger.info('DRY_RUN: 跳过摘除旧检测标签', { issue: issue.number, label: name });
      continue;
    }
    await githubRequest('DELETE', issueEndpoint(issue.number, `/labels/${encodeURIComponent(name)}`)).catch((error) =>
      logger.warn('摘除旧检测标签失败（不影响结论）', { error: formatError(error) }),
    );
  }
  if (wanted) await addLabels(issue.number, [wanted]);
};

const closeIssue = async (number) => {
  if (DRY_RUN) {
    logger.info('DRY_RUN: 跳过关闭 Issue', { issue: number });
    return;
  }
  await githubRequest('PATCH', issueEndpoint(number), { body: { state: 'closed', state_reason: 'not_planned' } });
};

/* ------------------------------------------------------------------ */
/* 抓取与判定                                                           */
/* ------------------------------------------------------------------ */

/**
 * 逐跳跟随重定向抓取一个 HTML 页面；每一跳都重新做 SSRF 校验（初始地址安全
 * 不代表跳转目标安全）。返回 { html, finalUrl, status, truncated } 或 { transport }。
 * @param {string} url
 * @param {{limitBytes?: number}} [options] 只要状态码时用小上限，别把整站首页读进内存
 */
const fetchHtml = async (url, { limitBytes = MAX_RESPONSE_BYTES } = {}) => {
  let current = url;
  const dispatcher = await getSafeFetchAgent();
  for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
    if (!(await isSafePublicHttpUrl(current))) {
      return { transport: buildTransportVerdict({ error: '非公开 HTTP(S) 地址（SSRF 防护拦截）' }) };
    }

    let response;
    try {
      response = await fetchWithRetry(
        current,
        { method: 'GET', redirect: 'manual', headers: REQUEST_HEADERS },
        { timeoutMs: REQUEST_TIMEOUT_MS, retries: REQUEST_RETRIES, dispatcher },
      );
    } catch (error) {
      const status = error instanceof RetryableHttpError ? error.status : 0;
      if (RESTRICTED_STATUS_CODES.has(status)) return { transport: buildTransportVerdict({ status }) };
      return { transport: buildTransportVerdict({ error: formatError(error) }) };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) return { transport: buildTransportVerdict({ error: '重定向缺少 Location' }) };
      try {
        current = new URL(location, current).toString();
      } catch {
        return { transport: buildTransportVerdict({ error: '重定向 Location 非法' }) };
      }
      continue;
    }

    if (RESTRICTED_STATUS_CODES.has(response.status)) {
      await response.body?.cancel().catch(() => {});
      return { transport: buildTransportVerdict({ status: response.status }) };
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { transport: buildTransportVerdict({ status: response.status }) };
    }

    const { bytes, truncated } = await readResponseBytesLimited(response, { maxBytes: limitBytes });
    const { text } = decodeHtmlBytes(bytes, response.headers.get('content-type') || '');
    return { html: text, finalUrl: current, status: response.status, truncated };
  }
  return { transport: buildTransportVerdict({ error: `重定向超过 ${MAX_REDIRECTS} 跳` }) };
};

/** 可达性探测只需要状态码，读 64 KB 足够（别把整站首页/图片拉进内存）。 */
const PROBE_LIMIT_BYTES = 64 * 1024;

/**
 * 探测一个地址在 Actions 出口（境外）能不能打开。
 * 与反链判定分开：这里回答的是「站点/头像存在吗」，不是「有没有挂本站的链接」。
 * @returns {Promise<{reachable: boolean, reason: string, status: number}>}
 */
const probeUrl = async (url) => {
  const fetched = await fetchHtml(url, { limitBytes: PROBE_LIMIT_BYTES });
  if (!fetched.transport) {
    logger.info('可达性探测结果', { url: sanitizeUrlForLogs(url), reachable: true, status: fetched.status });
    return { reachable: true, status: fetched.status, reason: `HTTP ${fetched.status}` };
  }
  const status = Number(fetched.transport.stats?.status ?? 0);
  const { reachable, reason } = classifyReachability({ status, error: fetched.transport.message });
  logger.info('可达性探测结果', { url: sanitizeUrlForLogs(url), reachable, status });
  return { reachable, status, reason };
};

/**
 * 渲染兜底：静态抓取没命中时，用无头浏览器把页面（含 iframe）渲染一次再判定。
 *
 * 只在「静态拿到了 HTML、但结论是 not-found / js-only」时调用 —— 静态都打不开的站点
 * 再渲染一次只是浪费时间。渲染失败/超时/被拦一律返回 null，由调用方沿用静态结论，
 * 绝不让「渲染没成功」被读成「没挂链」。
 *
 * @param {object} input
 * @param {string[]} input.candidates 已经静态抓到过 HTML 的页面地址
 * @param {string} input.claimedSiteUrl 申请人申报的站点地址
 * @returns {Promise<{ verdict: object, checked: string } | null>}
 */
const detectByRender = async ({ candidates, claimedSiteUrl }) => {
  if (!RENDER_FALLBACK_ENABLED) return null;
  const deadline = Date.now() + RENDER_BUDGET_MS;
  let best = null;
  for (const candidate of candidates) {
    if (Date.now() > deadline) {
      logger.warn('渲染兜底超出总预算，停止重试', { budgetMs: RENDER_BUDGET_MS });
      break;
    }
    const rendered = await renderPage(candidate, { timeoutMs: RENDER_TIMEOUT_MS });
    if (rendered.error) {
      logger.warn('渲染兜底未成功（沿用静态结论）', {
        url: sanitizeUrlForLogs(candidate),
        error: sanitizeLogValue(rendered.error),
      });
      continue;
    }
    if (rendered.status >= 400) {
      logger.warn('渲染兜底拿到错误状态码（沿用静态结论）', {
        url: sanitizeUrlForLogs(candidate),
        status: rendered.status,
      });
      continue;
    }
    const verdict = findBacklinkInAnchors({
      anchors: rendered.anchors,
      pageUrl: candidate,
      finalUrl: rendered.finalUrl,
      claimedUrl: claimedSiteUrl,
      acceptedHosts: ACCEPTED_HOSTS,
      rendered: true,
      frames: rendered.frames,
    });
    logger.info('渲染兜底判定完成', {
      url: sanitizeUrlForLogs(candidate),
      verdict: verdict.verdict,
      anchors: verdict.stats.anchorCount,
      frames: verdict.stats.frames,
    });
    if (verdict.verdict === BACKLINK_VERDICTS.FOUND) return { verdict, checked: candidate };
    best = best ?? { verdict, checked: candidate };
  }
  return best;
};

/**
 * 最多两次 GET：先抓申报的反链页面，未命中再退回站点首页（很多人挂在页脚）。
 * 命中即返回；两次都不命中时返回信息量更大的那次结论。
 * 静态路径全部未命中时，再走一次渲染兜底（见 detectByRender）。
 */
const detectBacklink = async ({ pageUrl, siteUrl: claimedSiteUrl }) => {
  const candidates = [...new Set([pageUrl, claimedSiteUrl].filter(Boolean))];
  let fallback = null;
  const staticHtmlCandidates = [];
  const staticVerdicts = [];
  for (const candidate of candidates) {
    const fetched = await fetchHtml(candidate);
    if (fetched.transport) {
      fallback = fetched.transport;
      logger.warn('反链页面抓取未成功，继续尝试下一个', { url: sanitizeUrlForLogs(candidate) });
      continue;
    }
    const verdict = findBacklink({
      html: fetched.html,
      pageUrl: candidate,
      finalUrl: fetched.finalUrl,
      claimedUrl: claimedSiteUrl,
      acceptedHosts: ACCEPTED_HOSTS,
      truncated: fetched.truncated,
    });
    if (verdict.verdict === BACKLINK_VERDICTS.FOUND) return { verdict, checked: candidate };
    fallback = fallback ?? verdict;
    staticHtmlCandidates.push(candidate);
    staticVerdicts.push(verdict.verdict);
    if (candidates.length === 1) break;
  }

  // 只有「页面本身拿到了、只是没看到链接」才值得渲染；offsite 是跳转问题，渲染救不了。
  const renderEligible =
    staticHtmlCandidates.length > 0 &&
    staticVerdicts.some(
      (verdict) => verdict === BACKLINK_VERDICTS.NOT_FOUND || verdict === BACKLINK_VERDICTS.JS_ONLY,
    ) &&
    !staticVerdicts.includes(BACKLINK_VERDICTS.OFFSITE);
  if (renderEligible) {
    const rendered = await detectByRender({ candidates: staticHtmlCandidates, claimedSiteUrl });
    if (rendered) return rendered;
  }

  return { verdict: fallback ?? buildTransportVerdict({ error: '没有可抓取的地址' }), checked: '' };
};

/* ------------------------------------------------------------------ */
/* 友链目录（从工作区读取，写入前用于去重与文件名避让）                  */
/* ------------------------------------------------------------------ */

const readFriendsDir = () => {
  const dir = path.join(ROOT_DIR, FRIENDS_DIR);
  if (!fs.existsSync(dir)) return { filenames: [], byCanonicalUrl: new Map() };
  const filenames = [];
  const byCanonicalUrl = new Map();
  for (const file of fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    const filename = file.slice(0, -'.json'.length);
    filenames.push(filename);
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (typeof data.url === 'string' && data.url.trim()) {
        const canonical = normalizeFriendUrl(data.url);
        if (!byCanonicalUrl.has(canonical)) byCanonicalUrl.set(canonical, []);
        byCanonicalUrl.get(canonical).push({ filename, data });
      }
    } catch (error) {
      logger.warn('友链文件解析失败（不影响本次判定）', { file, error: formatError(error) });
    }
  }
  return { filenames, byCanonicalUrl };
};

/* ------------------------------------------------------------------ */
/* 表单解析（三条路径共用）                                             */
/* ------------------------------------------------------------------ */

/**
 * 解析 + 校验 + 派生文件名。任何一步不过都返回 { blocked, comment }，
 * 由调用方决定「评论并结束」还是「中止写入」。
 */
const resolveApplication = (issue) => {
  const parsed = parseFriendIssueBody(issue.body);
  if (!parsed.ok) {
    return {
      blocked: '表单无法解析',
      comment: renderBlockedComment({
        title: '表单无法解析',
        reasons: [parsed.reason || '未知原因'],
        next: '请用「友链申请」模板重新提交，或直接编辑本 Issue 正文后等下一次检测。',
      }),
    };
  }

  const validated = validateFriendRecord(parsed.values, { acceptedHosts: ACCEPTED_HOSTS });
  if (!validated.ok) {
    return {
      blocked: '字段校验未通过',
      comment: renderBlockedComment({
        title: '字段校验未通过',
        reasons: validated.errors,
        next: '改正后可以编辑本 Issue（或评论一句）重跑检测。',
      }),
    };
  }

  let filename;
  try {
    filename = suggestFilename(issue.user?.login || '', validated.record.url, readFriendsDir().filenames);
  } catch (error) {
    return {
      blocked: '文件名无法派生',
      comment: renderBlockedComment({
        title: '文件名无法从提交者用户名派生',
        reasons: [formatError(error)],
        next: '请站长人工录入该友链（Pages CMS 的「友链」集合）。',
      }),
    };
  }

  return { parsed, validated, filename };
};

const issueUrl = (number) => `https://github.com/${OWNER}/${REPO}/issues/${number}`;

/* ------------------------------------------------------------------ */
/* A. 检测阶段：只读，只出证据                                          */
/* ------------------------------------------------------------------ */

const VERDICT_LABEL = {
  [BACKLINK_VERDICTS.FOUND]: LABELS.ok,
  [BACKLINK_VERDICTS.NOT_FOUND]: LABELS.missing,
};

const runDetect = async (issue) => {
  const { validated, filename, blocked, comment } = resolveApplication(issue);
  if (blocked) {
    await postComment(issue.number, comment);
    await syncDetectionLabel(issue, LABELS.needsInfo);
    await notify('friend-review', `【友链待审核】#${issue.number} ${blocked}（表单有问题）\n${issueUrl(issue.number)}`);
    logger.info('检测阶段：表单不可用，已退回', { reason: blocked });
    return;
  }

  /* 可达性闸门：站点或头像在境外根本打不开 → 自动驳回并关闭 Issue。
     这是唯一由机器人自己下的结论（用户 2026-10 授权，见 ai-rules/friends.md 规则 3），
     且只驳回、永远不写文件。 */
  const site = { url: validated.record.url, ...(await probeUrl(validated.record.url)) };
  const avatar = { url: validated.record.avatar, ...(await probeUrl(validated.record.avatar)) };
  if (!site.reachable || !avatar.reachable) {
    await postComment(issue.number, renderUnreachableComment({ site, avatar }));
    await syncDetectionLabel(issue, LABELS.unreachable);
    await closeIssue(issue.number);
    await notify(
      'friend-rejected',
      [
        `【友链自动驳回】#${issue.number} ${validated.record.name}`,
        `站点：${site.reachable ? '可访问' : '打不开'} — ${sanitizeLogValue(site.reason)}`,
        `头像：${avatar.reachable ? '可访问' : '打不开'} — ${sanitizeLogValue(avatar.reason)}`,
        `申请人：${issue.user?.login || '未知'}`,
        issueUrl(issue.number),
      ].join('\n'),
    );
    logger.info('可达性检查未通过，已自动驳回并关闭', {
      issue: issue.number,
      siteReachable: site.reachable,
      avatarReachable: avatar.reachable,
    });
    return;
  }

  const detectionUrl = pickDetectionUrl(validated);
  const { verdict, checked } = await detectBacklink({
    pageUrl: detectionUrl,
    siteUrl: validated.record.url,
  });

  const body = renderDetectComment({ validated, filename, result: verdict, siteUrl: SITE_URL });
  await postComment(issue.number, body);
  await syncDetectionLabel(issue, VERDICT_LABEL[verdict.verdict] ?? LABELS.needsInfo);
  await addLabels(issue.number, [LABELS.link]);

  await notify(
    'friend-review',
    [
      `【友链待审核】#${issue.number} ${validated.record.name}`,
      `检测结论：${verdict.verdict} — ${verdict.message}`,
      `站点：${validated.record.url}`,
      `申请人：${issue.user?.login || '未知'}`,
      issueUrl(issue.number),
    ]
      .filter(Boolean)
      .join('\n'),
  );
  logger.info('检测完成', {
    issue: issue.number,
    verdict: verdict.verdict,
    checked: checked ? sanitizeUrlForLogs(checked) : '',
    rendered: Boolean(verdict.stats?.rendered),
  });
};

/* ------------------------------------------------------------------ */
/* B. 执行阶段：friend-approved 是唯一写入路径                          */
/* ------------------------------------------------------------------ */

/* 读文件 / 写文件 / dispatch 的实现在 lib/friend-repo-io（与失联巡检共用），这里只留本路径的判据。 */
const readRepoFile = repoClient.readRepoFile;

/**
 * 写入单个文件（Contents API + sha 乐观锁）。冲突时重取 sha 重试一次，
 * 且只在「冲突文件仍是同一条友链（归一化 URL 相同）」时重试 —— 否则绝不覆盖别人。
 */
const writeRepoFile = ({ filePath, content, message, sha, canonicalUrl }) =>
  repoClient.writeRepoFile({
    filePath,
    content,
    message,
    sha,
    assertSame: (record) => normalizeFriendUrl(record.url) === canonicalUrl,
  });

/** 触发部署（deploy.yml 只允许 main，payload 按其守卫形状给）。 */
const dispatchDeploy = () => repoClient.dispatchWorkflow(DEPLOY_WORKFLOW);

const runApply = async (issue) => {
  const { validated, filename, blocked, comment } = resolveApplication(issue);
  if (blocked) {
    // 人工放行时表单坏了：不写，说明原因，等站长改完重新打标签。
    await postComment(
      issue.number,
      `${comment}\n\n> 本次 friend-approved 未执行：正文在等待期间被改动过。改正后请重新打标签。`,
    );
    logger.warn('审核通过但表单不可用，未写入', { issue: issue.number, reason: blocked });
    await notify(
      'friend-review',
      `【友链需人工】#${issue.number} 已通过审核但${blocked}，未写入\n${issueUrl(issue.number)}`,
    );
    return;
  }

  const { record, canonicalUrl, backlinkUrl } = validated;

  /* 本流程只做「新增收录」：申请类型字段已于 2026-10 经用户授权从表单与模板里删除，
     地址已收录一律退回，改信息与下架都走站长邮箱（友链页第三张卡片）。 */
  const dir = readFriendsDir();
  const matched = dir.byCanonicalUrl.get(canonicalUrl) ?? [];
  if (matched.length > 0) {
    await postComment(
      issue.number,
      renderBlockedComment({
        title: '该站点已在友链列表中',
        reasons: [`已收录（filename=${matched.map((item) => item.filename).join(', ')}），无需重复申请`],
        next: `如需修改名称/地址/简介/头像或下架，请邮件联系 ${REJECT_CONTACT_EMAIL}，无需重新打标签。`,
      }),
    );
    logger.info('重复申请，未写入', {
      issue: issue.number,
      existing: matched.map((item) => item.filename).join(','),
    });
    return;
  }

  const filePath = `${FRIENDS_DIR}/${filename}.json`;
  // dry-run 全程不出 GitHub API：现有内容直接读工作区里的那份（预览合并结果用）。
  const localPreview = DRY_RUN
    ? fs.existsSync(path.join(ROOT_DIR, filePath))
      ? { sha: null, content: fs.readFileSync(path.join(ROOT_DIR, filePath), 'utf8') }
      : null
    : null;
  const existing = DRY_RUN ? localPreview : await readRepoFile(filePath);
  const original = existing ? JSON.parse(existing.content) : null;
  const json = original ? mergeRecordJson(original, record, filename) : buildRecordJson({ record, filename });

  const action = original ? '更新' : '新增';
  logger.info('准备写入友链文件', { file: filePath, action });

  let commitSha = '';
  if (DRY_RUN) {
    commitSha = 'dry-run';
    console.log(`\n----- 拟写入 ${filePath} -----\n${json}\n`);
  } else {
    const written = await writeRepoFile({
      filePath,
      content: json,
      sha: existing?.sha,
      canonicalUrl,
      message: `feat(friends): 收录友链 ${record.name}（人工审核通过，#${issue.number}）`,
    });
    commitSha = written?.commit?.sha || '';

    // 写后自证：GITHUB_TOKEN 的 push 不触发 workflow，CI 兜不住，只能在这里确认。
    const commit = await githubRequest('GET', `/repos/${OWNER}/${REPO}/commits/${commitSha}`).catch((error) => {
      logger.warn('无法核对写入提交', { error: formatError(error) });
      return null;
    });
    const changed = (commit?.files ?? []).map((file) => file.filename);
    if (changed.length !== 1 || changed[0] !== filePath) {
      logger.error('写入改动了预期之外的文件，请立即检查', { commit: commitSha, files: changed.join(',') });
    }
    const readBack = await readRepoFile(filePath);
    const parsedBack = readBack ? JSON.parse(readBack.content) : null;
    if (!parsedBack || parsedBack.url !== record.url || parsedBack.name !== record.name) {
      logger.error('回读校验不通过：文件内容与本次记录不一致', { file: filePath });
    }
  }

  // 顺手重跑一次检测作为证据（失败不阻断：人工放行优先）。
  let verdict = null;
  try {
    verdict = (await detectBacklink({ pageUrl: pickDetectionUrl(validated), siteUrl: record.url })).verdict;
  } catch (error) {
    logger.warn('放行后的补充检测失败（不影响收录）', { error: formatError(error) });
  }

  let deployed = true;
  if (DRY_RUN) {
    logger.info('DRY_RUN: 跳过触发部署');
  } else {
    try {
      await dispatchDeploy();
    } catch (error) {
      deployed = false;
      logger.error('触发 deploy.yml 失败，需要手动部署', { error: formatError(error) });
    }
  }

  await postComment(
    issue.number,
    renderApprovedComment({
      record,
      filename,
      commitSha,
      result: verdict,
      deployed,
      backlinkUrl,
    }),
  );
  await addLabels(issue.number, [LABELS.link, LABELS.added, VERDICT_LABEL[verdict?.verdict] ?? LABELS.needsInfo]);

  await notify(
    'friend-added',
    [
      `【友链已收录】#${issue.number} ${record.name}`,
      `${action} ${filePath}（commit ${commitSha.slice(0, 7)}）`,
      `站点：${record.url}`,
      `检测：${verdict?.verdict ?? '未执行'}`,
      deployed ? '已触发 deploy.yml，部署跑完后生效' : '⚠️ 部署触发失败，请手动运行 deploy.yml',
      issueUrl(issue.number),
    ].join('\n'),
  );
  logger.info('友链已入库', { file: filePath, deployed });
};

/* ------------------------------------------------------------------ */
/* C. 拒绝：固定文案 + 关闭，不写任何文件                               */
/* ------------------------------------------------------------------ */

const runReject = async (issue) => {
  await postComment(issue.number, renderRejectComment());
  await closeIssue(issue.number);
  await notify(
    'friend-rejected',
    `【友链已拒绝】#${issue.number} ${issue.title || ''}\n已回复拒绝文案并关闭 Issue，未写入任何文件\n${issueUrl(issue.number)}`,
  );
  logger.info('已按站长的拒绝标签回复并关闭', { issue: issue.number });
};

/* ------------------------------------------------------------------ */
/* 飞书通知                                                             */
/* ------------------------------------------------------------------ */

const notify = async (event, text) => {
  if (DRY_RUN) {
    logger.info('DRY_RUN: 跳过飞书通知', { event });
    if (PRINT) console.log(`\n----- 飞书(${event}) -----\n${text}\n`);
    return;
  }
  try {
    await sendFeishuWebhookMessage(text, { event, title: 'pldduck 友链' });
  } catch (error) {
    // 通知失败不影响收录/拒绝本身（评论与文件才是事实）。
    logger.warn('飞书通知发送失败', { event, error: formatError(error) });
  }
};

/* ------------------------------------------------------------------ */
/* 事件路由                                                             */
/* ------------------------------------------------------------------ */

const hasLinkLabel = (issue) =>
  (issue?.labels ?? []).some((label) => (typeof label === 'string' ? label : label.name) === LABELS.link);

/**
 * 是不是友链申请：有 `friend-link` 标签，或正文就是一份申请。
 *
 * 后者是 2026-11 的实测补丁：外部申请人没有仓库写权限，GitHub 不会把预填链接里的
 * `labels=friend-link` 应用到他们创建的空白 Issue 上 —— 只认标签会把正常申请全部静默跳过。
 * 正文判定只要求两个必填段标题（见 looksLikeFriendApplication），解析失败仍走原来的
 * 「表单无法解析」评论，不会被当成友链申请乱写文件。
 */
const isFriendApplication = (issue) => hasLinkLabel(issue) || looksLikeFriendApplication(issue?.body);

/**
 * 判断本次事件该走哪条路径。防自循环三处在案（ai-rules/friends.md 规则 7）：
 * sender.type == 'Bot' 一律跳过；机器人正文/评论里带 FRIEND_ISSUE_MARKER 的跳过；
 * 评论重测只认 Issue 作者本人或 OWNER/MEMBER/COLLABORATOR。
 */
const resolveRoute = (eventName, payload) => {
  if (payload.sender?.type === 'Bot') return { action: 'skip', reason: '事件来自 Bot' };

  if (eventName === 'workflow_dispatch') {
    const mode = process.env.FRIEND_MODE || 'detect';
    const number = Number(process.env.FRIEND_ISSUE || '');
    if (!Number.isInteger(number) || number <= 0)
      return { action: 'skip', reason: 'workflow_dispatch 缺少合法的 issue 号' };
    if (!['detect', 'apply', 'reject'].includes(mode)) return { action: 'skip', reason: `未知 mode: ${mode}` };
    return { action: mode === 'detect' ? 'detect' : mode, issueNumber: number, manual: true };
  }

  if (eventName === 'issues') {
    const label = payload.label?.name ?? '';
    if (payload.action === 'labeled') {
      if (label === LABELS.approved) return { action: 'apply' };
      if (label === LABELS.rejected) return { action: 'reject' };
      // friend-link 不在这里触发检测：模板/页面预填都会在**创建时**带上这个标签，
      // GitHub 会额外发一次 labeled 事件 —— 若这里也返回 detect，一次申请会跑两遍
      // 检测、发两条一模一样的评论（2026-11 修复）。检测只由 opened/edited/reopened
      // 与申请人评论触发（见 ai-rules/friends.md 规则 8）。
      return { action: 'skip', reason: `该标签不触发检测：${sanitizeLogValue(label) || '(空)'}` };
    }
    if (['opened', 'edited', 'reopened'].includes(payload.action)) {
      if (!isFriendApplication(payload.issue)) return { action: 'skip', reason: '非友链 Issue' };
      if (payload.action === 'edited' && payload.issue?.body?.includes(FRIEND_ISSUE_MARKER)) {
        return { action: 'skip', reason: '正文含机器人标记' };
      }
      return { action: 'detect' };
    }
    return { action: 'skip', reason: `未处理的 issues action: ${payload.action}` };
  }

  if (eventName === 'issue_comment') {
    if (payload.action !== 'created') return { action: 'skip', reason: '评论非新建' };
    if (!isFriendApplication(payload.issue)) return { action: 'skip', reason: '非友链 Issue' };
    const body = payload.comment?.body ?? '';
    if (body.includes(FRIEND_ISSUE_MARKER)) return { action: 'skip', reason: '机器人自己的评论' };
    const association = payload.comment?.author_association ?? '';
    const isAuthor = payload.comment?.user?.login && payload.comment.user.login === payload.issue?.user?.login;
    if (!isAuthor && !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(association)) {
      return { action: 'skip', reason: `评论人无权触发重测：${sanitizeLogValue(association) || '未知'}` };
    }
    return { action: 'detect' };
  }

  return { action: 'skip', reason: `不支持的事件：${eventName}` };
};

const fetchIssue = async (number) => {
  const issue = await githubRequest('GET', issueEndpoint(number));
  if (!issue) throw new Error(`Issue #${number} 不存在`);
  return issue;
};

/* ------------------------------------------------------------------ */
/* 本地调试：不碰 GitHub                                               */
/* ------------------------------------------------------------------ */

const runLocalCheck = async () => {
  const fixture = readArg('fixture');
  const pageUrl = readArg('url') || readArg('check-url');
  // 本地单页调试时，「申报站点」默认就是被抓页面自己（否则同域判定会被
  // 拿来跟本站地址比，永远得出 offsite）。要模拟真实申请时用 --site 指定申报地址。
  const claimed = readArg('site') || pageUrl;

  if (!pageUrl && !fixture) {
    logger.error('本地模式需要 --url <页面地址>，或 --fixture <html 文件> 配合 --url');
    process.exitCode = 1;
    return;
  }

  // --render：直接走无头浏览器渲染口径（验证 JS 挂件是否真的挂上了本站链接）。
  // 需要本地先 `npx playwright install chromium`；不动 GitHub、不写任何文件。
  if (hasFlag('render')) {
    if (!pageUrl) {
      logger.error('--render 需要 --url <页面地址>');
      process.exitCode = 1;
      return;
    }
    const rendered = await renderPage(pageUrl, { timeoutMs: RENDER_TIMEOUT_MS });
    if (rendered.error) {
      logger.error('渲染失败', { error: sanitizeLogValue(rendered.error) });
      process.exitCode = 1;
      return;
    }
    const result = findBacklinkInAnchors({
      anchors: rendered.anchors,
      pageUrl,
      finalUrl: rendered.finalUrl,
      claimedUrl: claimed,
      acceptedHosts: ACCEPTED_HOSTS,
      rendered: true,
      frames: rendered.frames,
    });
    console.log(
      JSON.stringify(
        { verdict: result.verdict, message: result.message, stats: result.stats, anchors: result.anchors },
        null,
        2,
      ),
    );
    return;
  }

  let result;
  if (fixture) {
    const bytes = fs.readFileSync(path.resolve(ROOT_DIR, fixture));
    const { text } = decodeHtmlBytes(bytes, '');
    result = findBacklink({
      html: text,
      pageUrl,
      finalUrl: pageUrl,
      claimedUrl: claimed,
      acceptedHosts: ACCEPTED_HOSTS,
    });
  } else {
    const fetched = await fetchHtml(pageUrl);
    result = fetched.transport
      ? fetched.transport
      : findBacklink({
          html: fetched.html,
          pageUrl,
          finalUrl: fetched.finalUrl,
          claimedUrl: claimed,
          acceptedHosts: ACCEPTED_HOSTS,
          truncated: fetched.truncated,
        });
  }

  console.log(
    JSON.stringify(
      { verdict: result.verdict, message: result.message, stats: result.stats, anchors: result.anchors },
      null,
      2,
    ),
  );
};

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

const main = async () => {
  if (readArg('fixture') || readArg('url') || readArg('check-url')) {
    await runLocalCheck();
    return;
  }

  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const eventPath = process.env.GITHUB_EVENT_PATH || '';
  if (!eventName || !eventPath) {
    logger.error('缺少 GITHUB_EVENT_NAME/GITHUB_EVENT_PATH（Actions 环境自动注入）；本地请带 --fixture/--url');
    process.exitCode = 1;
    return;
  }
  if (!REPOSITORY) {
    logger.error('缺少 GITHUB_REPOSITORY');
    process.exitCode = 1;
    return;
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch (error) {
    logger.error('读取事件载荷失败', { error: formatError(error) });
    process.exitCode = 1;
    return;
  }

  const route = resolveRoute(eventName, payload);
  if (route.action === 'skip') {
    logger.info('本次事件不适用，跳过', { reason: route.reason });
    return;
  }

  const issue = route.manual ? await fetchIssue(route.issueNumber) : payload.issue;
  if (!issue?.number) {
    logger.error('事件载荷里没有 issue');
    process.exitCode = 1;
    return;
  }

  logger.info('处理友链申请', { issue: issue.number, action: route.action, manual: !!route.manual });

  if (route.action === 'detect') await runDetect(issue);
  else if (route.action === 'apply') await runApply(issue);
  else if (route.action === 'reject') await runReject(issue);
};

// 只有作为主模块直接运行时才执行：被测试或其他脚本 import 时不得有任何副作用
// （顶层会读事件载荷并发真实请求，误跑一次就是往 Issue 里写评论、打标签）。
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  await main();
}
