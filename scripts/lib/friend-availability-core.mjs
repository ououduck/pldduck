/**
 * friend-availability-core.mjs — 友链失联巡检的纯判定层（无网络、无 fs，全部可单测）。
 *
 * 为什么要有「复测 + 上限 + 熔断」这三层护栏：巡检会**覆盖站长在 Pages CMS 里手工勾选的
 * 「已失联」开关**（用户 2026-10 明确授权的双向同步）。一次网络抖动、一次出口 IP 被封，
 * 都可能把整站友链推进「已失联」板块，所以：
 *   - 单次探测失败不写（必须复测仍失败）；
 *   - 受限状态码（401/403/405/406/407/429）一律冻结，不判失联；
 *   - 一轮最多标 MAX_MARKS_PER_RUN 个；
 *   - DEAD 占比 ≥ GLOBAL_ABORT_RATIO 时判定「是我们出不去，不是它们挂了」，丢弃本轮全部写入。
 *
 * 与申请闸门（`friend-backlink.mjs` 的 `classifyReachability`）是**两套严格度不同的口径**：
 * 闸门要严（对方禁海外 = 读者打不开 = 不收录），巡检要宽（反爬 403 不等于博客死了）。不得合并。
 */

import { sanitizeUrlForLogs } from './http.mjs';

/** 巡检口径的探测结论。 */
export const AUDIT_VERDICTS = Object.freeze({
  REACHABLE: 'reachable',
  RESTRICTED: 'restricted',
  DEAD: 'dead',
  BLOCKED: 'blocked',
  ERROR: 'error',
});

/** 本轮对某个条目实际做了什么。只有前两种会产生写入。 */
export const AUDIT_ACTIONS = Object.freeze({
  MARK: 'mark-unavailable',
  RESTORE: 'restore',
  UNCHANGED: 'unchanged',
  FLAKY: 'flaky',
  FROZEN: 'frozen-restricted',
  OVER_CAP: 'over-cap',
  RECHECK_ERROR: 'recheck-error',
  NEEDS_RECHECK: 'needs-recheck',
  INVALID: 'invalid',
  ABORTED: 'aborted',
});

/** 单轮最多新标记多少个失联（恢复不设限：恢复是「回到真相」，风险方向不同）。 */
export const MAX_MARKS_PER_RUN = 3;
/** DEAD 占比达到该阈值即认为失败面在探测方，丢弃本轮全部写入。 */
export const GLOBAL_ABORT_RATIO = 0.5;
/**
 * 熔断至少要有这么多条有效探测才生效：友链本来就只收录了两三条时，
 * 「一条挂了」就是 100% 失败率，按比例熔断会让小站永远标不了失联。
 */
export const MIN_ABORT_SAMPLE = 4;

const { REACHABLE, RESTRICTED, DEAD, BLOCKED, ERROR } = AUDIT_VERDICTS;
const { MARK, RESTORE, UNCHANGED, FLAKY, FROZEN, OVER_CAP, RECHECK_ERROR, NEEDS_RECHECK, INVALID, ABORTED } =
  AUDIT_ACTIONS;

/**
 * 把 `checkUrl` 的返回折成巡检结论。
 * `blocked:` 前缀是 SSRF 防护拦截（`check-broken-links.mjs` 的约定），不是对方站点的问题。
 */
export const classifyAuditVerdict = (probe) => {
  if (!probe || typeof probe !== 'object') return ERROR;
  const error = typeof probe.error === 'string' ? probe.error : '';
  if (/^blocked\b/i.test(error)) return BLOCKED;
  if (probe.ok === true) return probe.restricted === true ? RESTRICTED : REACHABLE;
  if (probe.ok === false) return DEAD;
  return ERROR;
};

const ACTION_LABEL = {
  [MARK]: '标记失联',
  [RESTORE]: '移回正常',
  [UNCHANGED]: '不变',
  [FLAKY]: '抖动，不动',
  [FROZEN]: '受限冻结',
  [OVER_CAP]: '超上限未标',
  [RECHECK_ERROR]: '复测异常',
  [NEEDS_RECHECK]: '缺复测',
  [INVALID]: '记录不可用',
  [ABORTED]: '熔断丢弃',
};

const VERDICT_LABEL = {
  [REACHABLE]: '可达',
  [RESTRICTED]: '可达但受限',
  [DEAD]: '不可达',
  [BLOCKED]: '被拦截',
  [ERROR]: '探测异常',
};

const labelOf = (map, key) => map[key] ?? key;

/**
 * 决策表：首轮结论 × 复测结论 × 当前 `unavailable` → 动作。
 *
 * @param {Array<{filename: string, url: string, unavailable: boolean,
 *                first?: object, second?: object|null, invalidReason?: string}>} records
 *        `first`/`second` 是 `checkUrl` 的原始返回；`second` 为 null 表示未复测。
 * @param {{maxMarksPerRun?: number, abortRatio?: number}} [options]
 */
export const buildRunPlan = (records = [], options = {}) => {
  const maxMarks = Number.isFinite(options.maxMarksPerRun) ? options.maxMarksPerRun : MAX_MARKS_PER_RUN;
  const abortRatio = Number.isFinite(options.abortRatio) ? options.abortRatio : GLOBAL_ABORT_RATIO;
  const minAbortSample = Number.isFinite(options.minAbortSample) ? options.minAbortSample : MIN_ABORT_SAMPLE;

  const rows = records.map((entry) => {
    const first = entry.invalidReason ? INVALID : classifyAuditVerdict(entry.first);
    const second =
      entry.invalidReason || entry.second === null || entry.second === undefined
        ? null
        : classifyAuditVerdict(entry.second);
    return {
      filename: String(entry.filename || ''),
      url: String(entry.url || ''),
      unavailable: entry.unavailable === true,
      first,
      second,
      status: entry.first?.status ?? null,
      error: entry.invalidReason || entry.first?.error || '',
    };
  });

  // 文件名排序：标记上限必须有确定性的选取顺序，否则同一轮重跑会标到不同条目。
  rows.sort((a, b) => a.filename.localeCompare(b.filename));

  const probed = rows.filter((row) => row.first !== INVALID);
  const deadCount = probed.filter((row) => row.first === DEAD).length;
  const deadRatio = probed.length === 0 ? 0 : deadCount / probed.length;
  const aborted = probed.length >= minAbortSample && deadRatio >= abortRatio;

  let marks = 0;
  const results = rows.map((row) => {
    const base = { ...row, to: row.unavailable };
    if (row.first === INVALID) return { ...base, action: INVALID, note: row.error };
    if (aborted) return { ...base, action: ABORTED, note: `不可达占比 ${(deadRatio * 100).toFixed(0)}%` };
    if (row.first === BLOCKED || row.first === ERROR) {
      return { ...base, action: INVALID, note: row.error || labelOf(VERDICT_LABEL, row.first) };
    }
    if (row.first === RESTRICTED) {
      return { ...base, action: FROZEN, note: row.status ? `HTTP ${row.status}` : '' };
    }
    if (row.first === REACHABLE) {
      return row.unavailable
        ? { ...base, action: RESTORE, to: false, note: '站点已恢复' }
        : { ...base, action: UNCHANGED, note: '' };
    }
    // 剩下只有 DEAD：必须复测仍失败才动开关。
    if (row.second === null) return { ...base, action: NEEDS_RECHECK, note: '未复测，不写' };
    if (row.second === REACHABLE || row.second === RESTRICTED) {
      return { ...base, action: FLAKY, note: '复测可达，判为抖动' };
    }
    if (row.second === BLOCKED || row.second === ERROR) {
      return { ...base, action: RECHECK_ERROR, note: row.error || '复测异常' };
    }
    if (row.unavailable) return { ...base, action: UNCHANGED, note: '已标记，幂等跳过' };
    if (marks >= maxMarks) {
      return { ...base, action: OVER_CAP, note: `单轮上限 ${maxMarks} 个，本轮未标` };
    }
    marks += 1;
    return { ...base, action: MARK, to: true, note: row.status ? `HTTP ${row.status}` : '两次探测均不可达' };
  });

  const writes = results
    .filter((row) => row.action === MARK || row.action === RESTORE)
    .map((row) => ({ filename: row.filename, url: row.url, from: row.unavailable, to: row.to }));

  const count = (action) => results.filter((row) => row.action === action).length;
  const summary = {
    checked: rows.length,
    dead: results.filter((row) => row.first === DEAD).length,
    reachable: count(UNCHANGED) + count(RESTORE),
    restricted: count(FROZEN),
    flaky: count(FLAKY),
    invalid: count(INVALID),
    overCap: count(OVER_CAP),
    marks: count(MARK),
    restores: count(RESTORE),
    writes: writes.length,
    aborted,
    deadRatio,
  };

  return { results, writes, summary, aborted, deadRatio };
};

/** Actions summary 表格的行（列：文件名｜站点｜探测｜复测｜动作｜备注）。 */
export const planToRows = (plan) =>
  plan.results.map((row) => ({
    文件名: row.filename,
    站点: sanitizeUrlForLogs(row.url),
    探测: labelOf(VERDICT_LABEL, row.first),
    复测: row.second ? labelOf(VERDICT_LABEL, row.second) : '—',
    动作: labelOf(ACTION_LABEL, row.action),
    备注: row.note || '',
  }));

/**
 * 飞书正文（纯文本，卡片由 feishu-webhook 组装）。URL 一律脱敏：
 * 友链条目的 url 是用户可控文本，可能带 userinfo 凭据。
 */
export const planToFeishuText = (plan, { dryRun = false } = {}) => {
  const { summary } = plan;
  const head = [
    `检查 ${summary.checked}｜不可达 ${summary.dead}｜标记 ${summary.marks}｜恢复 ${summary.restores}｜受限 ${summary.restricted}｜抖动 ${summary.flaky}`,
    dryRun
      ? 'DRY RUN：只报告，不写入、不触发部署'
      : summary.aborted
        ? `⚠️ 本轮熔断（不可达占比 ${(summary.deadRatio * 100).toFixed(0)}%），未写入任何改动`
        : `已写入 ${summary.writes} 个文件${summary.writes > 0 ? '，已触发一次部署' : '（无改动，未触发部署）'}`,
  ];
  if (summary.overCap > 0) {
    head.push(`⚠️ ${summary.overCap} 个站点确认失联但超出单轮标记上限，留到下一轮`);
  }
  if (summary.invalid > 0) {
    head.push(`⚠️ ${summary.invalid} 条记录探测被拦截或不可用，未改动`);
  }

  const changed = plan.results.filter((row) => row.action === MARK || row.action === RESTORE);
  const notable = plan.results.filter(
    (row) => row.action === FLAKY || row.action === OVER_CAP || row.action === INVALID || row.action === RECHECK_ERROR,
  );
  const lines = [];
  if (changed.length > 0) {
    lines.push('', '本次改动：');
    for (const row of changed) {
      lines.push(
        `- ${row.to ? '标记失联' : '移回正常'}：${row.filename}（${sanitizeUrlForLogs(row.url)}）${row.note ? ` — ${row.note}` : ''}`,
      );
    }
  }
  if (notable.length > 0) {
    lines.push('', '需留意：');
    for (const row of notable) {
      lines.push(
        `- ${labelOf(ACTION_LABEL, row.action)}：${row.filename}（${sanitizeUrlForLogs(row.url)}）${row.note ? ` — ${row.note}` : ''}`,
      );
    }
  }
  return [...head, ...lines].join('\n');
};
