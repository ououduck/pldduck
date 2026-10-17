/**
 * friend-availability-check.mjs — 友链失联每日巡检。
 *
 * 探测 `friends/*.json` 每条记录的站点 URL，把结论双向同步进 `unavailable` 开关
 * （标记失联 / 移回正常），有改动时触发一次部署。判定与护栏全在
 * `lib/friend-availability-core.mjs`（纯函数、有单测），本文件只做：读目录、发请求、
 * 调 GitHub REST、发通知。
 *
 * 会覆盖站长在 Pages CMS 里手工勾选的开关 —— 依据用户 2026-10 明确授权（见
 * ai-rules/friends.md 规则 1/5）。护栏：单轮最多标 3 个、失联必须两次探测都失败、
 * 受限状态码冻结不动、不可达占比过半整轮熔断。
 *
 * 本地跑（默认只报告，不写仓库）：
 *   node scripts/friend-availability-check.mjs --dry-run --print
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
import { isProxyArtifactDnsExplicitlyAllowed } from './lib/http.mjs';
import { checkUrl, isProxyArtifactDnsEnvironment } from './check-broken-links.mjs';
import { FRIENDS_DIR, withUnavailable } from './lib/friend-form-core.mjs';
import {
  AUDIT_VERDICTS,
  GLOBAL_ABORT_RATIO,
  MAX_MARKS_PER_RUN,
  MIN_ABORT_SAMPLE,
  buildRunPlan,
  classifyAuditVerdict,
  planToFeishuText,
  planToRows,
} from './lib/friend-availability-core.mjs';
import { createRepoClient } from './lib/friend-repo-io.mjs';

const logger = createActionLogger('friend-availability');
installGlobalErrorHandlers(logger);

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOY_WORKFLOW = 'deploy.yml';

/** 首轮与复测之间的间隔：只等一次，不让 N 个候选各等 30s。 */
const RECHECK_DELAY_MS = parseEnvNumber(process.env.FRIEND_AUDIT_RECHECK_DELAY_MS, 30000);
const PROBE_CONCURRENCY = 4;
const PROBE_DELAY_MS = 150;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const DRY_RUN = hasFlag('dry-run');
const PRINT = hasFlag('print');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* 读友链清单                                                           */
/* ------------------------------------------------------------------ */

/**
 * 读 `friends/*.json`。**只探测站点 url，头像不探测**：头像挂了不影响读者访问站点，
 * 而巡检唯一的写入就是 `unavailable` 一个键，拿头像结论去翻它会扩大误判面。
 */
const readFriendRecords = () => {
  const dir = path.join(ROOT_DIR, FRIENDS_DIR);
  if (!fs.existsSync(dir)) {
    logger.warn('friends 目录不存在，无事可做', { path: FRIENDS_DIR });
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const filename = file.slice(0, -'.json'.length);
      const record = { filename, url: '', avatar: '', unavailable: false };
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        record.unavailable = data.unavailable === true;
        record.avatar = typeof data.avatar === 'string' ? data.avatar : '';
        record.url = typeof data.url === 'string' ? data.url : '';
        // 键里的 filename 与文件名不一致时不写：withUnavailable 会照抄键值，
        // 静默改掉它等于替 Pages CMS 换了一条记录的标识。
        if (data.filename !== filename) {
          record.invalidReason = `文件内 filename 键（${sanitizeLogValue(String(data.filename ?? ''))}）与文件名不一致`;
        } else if (!/^https?:\/\//i.test(record.url)) {
          record.invalidReason = 'url 缺失或不是 http(s) 地址';
        }
      } catch (error) {
        record.invalidReason = `JSON 解析失败：${formatError(error)}`;
      }
      return record;
    });
};

/* ------------------------------------------------------------------ */
/* 探测                                                                 */
/* ------------------------------------------------------------------ */

/** 并发探测一批 URL（与 check-broken-links 同口径：4 worker + 固定间隔）。 */
const probeAll = async (urls) => {
  const results = new Map();
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, urls.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) return;
      const url = urls[index];
      try {
        results.set(url, await checkUrl(url));
      } catch (error) {
        results.set(url, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      await sleep(PROBE_DELAY_MS);
    }
  });
  await Promise.all(workers);
  return results;
};

/* ------------------------------------------------------------------ */
/* 写入                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 把计划里的写入落到仓库：重新读一次现值（工作区副本只是参考），
 * 值已一致就不提交空改动，只有真改了才 PUT。
 * @returns {Promise<Array<{filename: string, url: string, to: boolean, commitSha: string}>>}
 */
const applyWrites = async (client, writes) => {
  const done = [];
  for (const write of writes) {
    const filePath = `${FRIENDS_DIR}/${write.filename}.json`;
    try {
      const existing = await client.readRepoFile(filePath);
      if (!existing) {
        logger.warn('目标文件读不到，跳过', { file: filePath });
        continue;
      }
      const current = JSON.parse(existing.content);
      if ((current.unavailable === true) === write.to) {
        logger.info('现值已与结论一致，不写入', { file: filePath });
        continue;
      }
      const content = withUnavailable(current, write.to);
      if (content === existing.content) {
        logger.info('序列化结果与现有正文一致，不写入', { file: filePath });
        continue;
      }
      const written = await client.writeRepoFile({
        filePath,
        content,
        sha: existing.sha,
        // 冲突重试的同一性判据按文件名认领：巡检一次只动一个文件的一个键。
        assertSame: (record) => record.filename === write.filename,
        message: `chore(friends): ${write.to ? '标记失联' : '移回正常'} ${write.filename}（友链巡检自动同步）`,
      });
      const commitSha = written?.commit?.sha || '';
      const commit = commitSha
        ? await client.request('GET', `/repos/${client.owner}/${client.repo}/commits/${commitSha}`).catch(() => null)
        : null;
      const changed = (commit?.files ?? []).map((file) => file.filename);
      if (commit && (changed.length !== 1 || changed[0] !== filePath)) {
        logger.error('写入改动了预期之外的文件，请立即检查', { commit: commitSha, files: changed.join(',') });
      }
      done.push({ filename: write.filename, url: write.url, to: write.to, commitSha });
      logger.info('已同步 unavailable', { file: filePath, to: write.to, commitSha: commitSha.slice(0, 7) });
    } catch (error) {
      // 单条失败不中断整轮：剩下的条目仍按各自结论处理。
      logger.error('写入失败，跳过该条', { file: filePath, error: formatError(error) });
    }
  }
  return done;
};

/* ------------------------------------------------------------------ */
/* 分支守卫                                                             */
/* ------------------------------------------------------------------ */

/**
 * 只有 main 上的结果会被发布，别的分支写入等于往线上数据里灌未审内容。
 * dispatch payload 是调用方任意 JSON：只取 repository.ref 比对，且永不拼进 shell。
 */
const assertMainOnly = () => {
  const raw = process.env.DISPATCH_PAYLOAD || '';
  if (raw.trim()) {
    let ref = '';
    try {
      ref = String(JSON.parse(raw)?.repository?.ref || '');
    } catch {
      throw new Error('dispatch payload 不是合法 JSON');
    }
    if (ref && ref !== 'main') throw new Error(`友链巡检只允许 main 分支，收到 ref: ${sanitizeLogValue(ref)}`);
  }
  const head = process.env.GITHUB_REF || '';
  if (head && head !== 'refs/heads/main') {
    throw new Error(`友链巡检只在 main 上运行，当前 ${sanitizeLogValue(head)}`);
  }
};

/* ------------------------------------------------------------------ */
/* 入口                                                                 */
/* ------------------------------------------------------------------ */

const main = async () => {
  assertMainOnly();

  if (process.env.GITHUB_ACTIONS !== 'true' && (await isProxyArtifactDnsEnvironment())) {
    if (isProxyArtifactDnsExplicitlyAllowed()) {
      logger.info('检测到本地 TUN 代理（DNS fake-IP）：ALLOW_PROXY_ARTIFACT_DNS=1，请求经代理转发');
    } else {
      logger.warn(
        '检测到本地 TUN 代理（DNS fake-IP）：未设 ALLOW_PROXY_ARTIFACT_DNS=1 时 IP 级 SSRF 校验会拦下全部域名，' +
          '本地跑请加该环境变量，否则结论不可信',
      );
    }
  }

  const records = readFriendRecords();
  if (records.length === 0) {
    logger.info('没有可巡检的友链记录');
    return 0;
  }
  logger.info('开始友链失联巡检', {
    total: records.length,
    dryRun: DRY_RUN,
    maxMarksPerRun: MAX_MARKS_PER_RUN,
    abortRatio: GLOBAL_ABORT_RATIO,
  });

  const probeable = records.filter((record) => !record.invalidReason);
  const firstPass = await probeAll(probeable.map((record) => record.url));
  for (const record of records) {
    record.first = record.invalidReason ? undefined : firstPass.get(record.url);
    record.second = null;
  }

  // 熔断先看一眼：判定为「是我们出不去」时不必再花 30s 复测。
  const firstDead = probeable.filter((record) => classifyAuditVerdict(record.first) === AUDIT_VERDICTS.DEAD).length;
  const needRecheck =
    probeable.length < MIN_ABORT_SAMPLE || firstDead / probeable.length < GLOBAL_ABORT_RATIO
      ? probeable.filter((record) => classifyAuditVerdict(record.first) === AUDIT_VERDICTS.DEAD)
      : [];

  if (needRecheck.length > 0) {
    logger.info('等待后复测不可达候选', { candidates: needRecheck.length, delayMs: RECHECK_DELAY_MS });
    await sleep(RECHECK_DELAY_MS);
    const secondPass = await probeAll(needRecheck.map((record) => record.url));
    for (const record of needRecheck) record.second = secondPass.get(record.url);
  } else if (firstDead > 0) {
    logger.warn('不可达占比过半，判定为探测侧故障，跳过复测与全部写入', {
      dead: firstDead,
      probed: probeable.length,
    });
  }

  const plan = buildRunPlan(records);
  if (PRINT) {
    console.log(
      `\n----- 巡检结论 -----\n${planToRows(plan)
        .map((row) => JSON.stringify(row))
        .join('\n')}\n`,
    );
  }
  logger.summaryTable('友链失联巡检', planToRows(plan));

  let applied = [];
  if (plan.writes.length === 0) {
    logger.info('本轮无需改动友链数据', { checked: plan.summary.checked, aborted: plan.aborted });
  } else if (DRY_RUN) {
    logger.info('DRY_RUN：不写入、不触发部署', {
      wouldWrite: plan.writes.map((w) => `${w.filename}→${w.to}`).join(','),
    });
  } else {
    const client = createRepoClient({
      token: process.env.GITHUB_TOKEN || '',
      owner: (process.env.GITHUB_REPOSITORY || '').split('/')[0],
      repo: (process.env.GITHUB_REPOSITORY || '').split('/')[1],
      logger,
    });
    applied = await applyWrites(client, plan.writes);
    if (applied.length > 0) {
      try {
        await client.dispatchWorkflow(DEPLOY_WORKFLOW);
        logger.info('已触发 deploy.yml', { files: applied.length });
      } catch (error) {
        logger.error('触发 deploy.yml 失败，需要手动部署', { error: formatError(error) });
      }
    }
  }

  const text = [planToFeishuText(plan, { dryRun: DRY_RUN })];
  if (!DRY_RUN && plan.writes.length > 0) {
    text.push(
      applied.length === plan.writes.length
        ? `实际提交 ${applied.length} 个文件`
        : `⚠️ 计划写入 ${plan.writes.length} 个，实际提交 ${applied.length} 个（其余见 Actions 日志）`,
    );
  }
  try {
    await sendFeishuWebhookMessage(text.filter(Boolean).join('\n'), {
      event: 'friend-availability',
      title: '🔗 pldduck 友链失联审核',
    });
  } catch (error) {
    logger.error('飞书通知失败（不影响数据同步）', { error: formatError(error) });
  }

  logger.info('巡检结束', {
    checked: plan.summary.checked,
    marks: plan.summary.marks,
    restores: plan.summary.restores,
    committed: applied.length,
    aborted: plan.aborted,
  });
  // 有确认失联/恢复以外的异常分支时不改变退出码：巡检是数据维护，不是门禁。
  return 0;
};

// 只有作为主模块直接运行时才执行：被测试或其他脚本 import 时不得有副作用（真实网络请求）。
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    process.exitCode = await main();
  } catch (error) {
    logger.error('friend-availability-check failed', formatError(error));
    process.exitCode = 1;
  }
}
