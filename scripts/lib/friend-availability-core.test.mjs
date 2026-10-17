import { describe, it, expect } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_VERDICTS,
  GLOBAL_ABORT_RATIO,
  MAX_MARKS_PER_RUN,
  buildRunPlan,
  classifyAuditVerdict,
  planToFeishuText,
  planToRows,
} from './friend-availability-core.mjs';
import { classifyReachability } from './friend-backlink.mjs';

const { MARK, RESTORE, UNCHANGED, FLAKY, FROZEN, OVER_CAP, RECHECK_ERROR, NEEDS_RECHECK, INVALID, ABORTED } =
  AUDIT_ACTIONS;

const entry = (filename, overrides = {}) => ({
  filename,
  url: `https://${filename}.example`,
  unavailable: false,
  first: { ok: true, status: 200 },
  second: null,
  ...overrides,
});

const dead = { ok: false, error: 'fetch failed' };
const dead404 = { ok: false, status: 404 };
const restricted403 = { ok: true, restricted: true, status: 403 };

const actionsOf = (plan) => Object.fromEntries(plan.results.map((r) => [r.filename, r.action]));

describe('classifyAuditVerdict', () => {
  it('受限状态码不算失联（用户口径：反爬/禁海外 ≠ 博客死了）', () => {
    for (const status of [401, 403, 405, 406, 407, 429]) {
      expect(classifyAuditVerdict({ ok: true, restricted: true, status })).toBe(AUDIT_VERDICTS.RESTRICTED);
    }
  });

  it('超时/DNS/404/5xx 判不可达', () => {
    expect(classifyAuditVerdict({ ok: false, error: 'network (3 次尝试)' })).toBe(AUDIT_VERDICTS.DEAD);
    expect(classifyAuditVerdict(dead404)).toBe(AUDIT_VERDICTS.DEAD);
    expect(classifyAuditVerdict({ ok: false, status: 503 })).toBe(AUDIT_VERDICTS.DEAD);
  });

  it('SSRF 拦截与探测异常单独成类，不进入失联判定', () => {
    expect(classifyAuditVerdict({ ok: false, error: 'blocked: 非公开 HTTP(S) 地址（SSRF 防护拦截）' })).toBe(
      AUDIT_VERDICTS.BLOCKED,
    );
    expect(classifyAuditVerdict(undefined)).toBe(AUDIT_VERDICTS.ERROR);
    expect(classifyAuditVerdict({})).toBe(AUDIT_VERDICTS.ERROR);
  });

  it('2xx 可达', () => {
    expect(classifyAuditVerdict({ ok: true, status: 200 })).toBe(AUDIT_VERDICTS.REACHABLE);
  });

  /**
   * 漂移守卫：申请闸门与巡检是两套严格度不同的口径，谁把它们统一了这条测试就红。
   * 闸门判 403「不可达」（对方禁海外 = 读者打不开 = 不收录），
   * 巡检判 403「可达但受限」（反爬拦截 ≠ 博客失联）。
   */
  it('两套可达口径必须保持分歧', () => {
    expect(classifyReachability({ status: 403 }).reachable).toBe(false);
    expect(classifyAuditVerdict(restricted403)).toBe(AUDIT_VERDICTS.RESTRICTED);
    expect(classifyReachability({ status: 200 }).reachable).toBe(true);
    expect(classifyAuditVerdict({ ok: true, status: 200 })).toBe(AUDIT_VERDICTS.REACHABLE);
  });
});

describe('buildRunPlan · 决策表', () => {
  it('不可达且复测仍不可达 → 标记失联', () => {
    const plan = buildRunPlan([entry('a', { first: dead, second: dead })]);
    expect(actionsOf(plan)).toEqual({ a: MARK });
    expect(plan.writes).toEqual([{ filename: 'a', url: 'https://a.example', from: false, to: true }]);
  });

  it('已标记且仍不可达 → 幂等跳过', () => {
    const plan = buildRunPlan([entry('a', { unavailable: true, first: dead, second: dead })]);
    expect(actionsOf(plan)).toEqual({ a: UNCHANGED });
    expect(plan.writes).toHaveLength(0);
  });

  it('不可达但复测可达 → 抖动，不动', () => {
    const plan = buildRunPlan([entry('a', { first: dead, second: { ok: true, status: 200 } })]);
    expect(actionsOf(plan)).toEqual({ a: FLAKY });
    expect(plan.writes).toHaveLength(0);
  });

  it('不可达但复测受限 → 也算抖动（有一次成功响应就不标失联）', () => {
    const plan = buildRunPlan([entry('a', { first: dead, second: restricted403 })]);
    expect(actionsOf(plan)).toEqual({ a: FLAKY });
  });

  it('缺复测结果的不可达条目绝不写入', () => {
    const plan = buildRunPlan([entry('a', { first: dead, second: null })]);
    expect(actionsOf(plan)).toEqual({ a: NEEDS_RECHECK });
    expect(plan.writes).toHaveLength(0);
  });

  it('复测被拦截/异常 → 不判失联', () => {
    const plan = buildRunPlan([entry('a', { first: dead, second: { ok: false, error: 'blocked: x' } })]);
    expect(actionsOf(plan)).toEqual({ a: RECHECK_ERROR });
  });

  it('可达但当前已标记 → 移回正常（双向同步会覆盖人工勾选）', () => {
    const plan = buildRunPlan([entry('a', { unavailable: true, first: { ok: true, status: 200 } })]);
    expect(actionsOf(plan)).toEqual({ a: RESTORE });
    expect(plan.writes[0].to).toBe(false);
  });

  it('可达且当前未标记 → 不变', () => {
    const plan = buildRunPlan([entry('a')]);
    expect(actionsOf(plan)).toEqual({ a: UNCHANGED });
    expect(plan.writes).toHaveLength(0);
  });

  it('受限一律冻结：无论当前开关是什么值都不写', () => {
    const plan = buildRunPlan([
      entry('a', { unavailable: false, first: restricted403 }),
      entry('b', { unavailable: true, first: restricted403 }),
    ]);
    expect(actionsOf(plan)).toEqual({ a: FROZEN, b: FROZEN });
    expect(plan.writes).toHaveLength(0);
    expect(plan.results[0].note).toBe('HTTP 403');
  });

  it('记录不可用（解析失败/缺字段）→ 跳过并告警', () => {
    const plan = buildRunPlan([entry('a', { invalidReason: 'JSON 解析失败', first: undefined })]);
    expect(actionsOf(plan)).toEqual({ a: INVALID });
    expect(plan.writes).toHaveLength(0);
  });
});

describe('buildRunPlan · 护栏', () => {
  const deadBoth = (filename, unavailable = false) => entry(filename, { unavailable, first: dead, second: dead });

  it('单轮标记上限：超出部分只报告', () => {
    // 垫 6 条可达，把不可达占比压到熔断阈值以下，专测上限本身。
    const plan = buildRunPlan([
      ...Array.from({ length: MAX_MARKS_PER_RUN + 2 }, (_, i) => deadBoth(`f${i}`)),
      ...Array.from({ length: 6 }, (_, i) => entry(`ok${i}`)),
    ]);
    expect(plan.aborted).toBe(false);
    expect(plan.summary.marks).toBe(MAX_MARKS_PER_RUN);
    expect(plan.summary.overCap).toBe(2);
    // 上限按文件名确定性选取，重跑同一轮不会标到别的条目
    expect(plan.writes.map((w) => w.filename)).toEqual(['f0', 'f1', 'f2']);
    // 超额条目必须显式标 OVER_CAP，报告才说得出「为什么没动它」
    expect(plan.results.filter((r) => r.action === OVER_CAP).map((r) => r.filename)).toEqual(['f3', 'f4']);
  });

  it('恢复不受上限约束', () => {
    const n = MAX_MARKS_PER_RUN + 3;
    const plan = buildRunPlan(
      Array.from({ length: n }, (_, i) => entry(`f${i}`, { unavailable: true, first: { ok: true, status: 200 } })),
    );
    expect(plan.summary.restores).toBe(n);
    expect(plan.summary.marks).toBe(0);
  });

  it('全局熔断：不可达占比达阈值时丢弃全部写入（含恢复）', () => {
    const records = [
      deadBoth('a'),
      deadBoth('b', true),
      entry('c', { unavailable: true, first: { ok: true, status: 200 } }),
      entry('d'),
      entry('e'),
    ];
    expect(2 / 5).toBeLessThan(GLOBAL_ABORT_RATIO);
    expect(buildRunPlan(records).aborted).toBe(false);

    const abortedPlan = buildRunPlan([
      deadBoth('a'),
      deadBoth('b', true),
      entry('c', { unavailable: true, first: { ok: true, status: 200 } }),
      entry('d'),
    ]);
    expect(abortedPlan.aborted).toBe(true);
    expect(abortedPlan.writes).toHaveLength(0);
    expect(actionsOf(abortedPlan)).toEqual({ a: ABORTED, b: ABORTED, c: ABORTED, d: ABORTED });
  });

  it('恰好等于阈值即熔断', () => {
    const plan = buildRunPlan([deadBoth('a'), deadBoth('b'), entry('c'), entry('d')]);
    expect(plan.deadRatio).toBe(GLOBAL_ABORT_RATIO);
    expect(plan.aborted).toBe(true);
  });

  it('样本太小不按比例熔断（只收录两三条友链的站也要能标失联）', () => {
    const plan = buildRunPlan([deadBoth('a'), entry('b')]);
    expect(plan.deadRatio).toBe(GLOBAL_ABORT_RATIO);
    expect(plan.aborted).toBe(false);
    expect(actionsOf(plan)).toEqual({ a: MARK, b: UNCHANGED });
  });

  it('全部记录不可用时不熔断、也不写', () => {
    const plan = buildRunPlan([
      entry('a', { invalidReason: '缺 url', first: undefined }),
      entry('b', { invalidReason: 'JSON 解析失败', first: undefined }),
    ]);
    expect(plan.aborted).toBe(false);
    expect(plan.writes).toHaveLength(0);
    expect(plan.summary.checked).toBe(2);
  });

  it('空清单不炸', () => {
    const plan = buildRunPlan([]);
    expect(plan.summary.checked).toBe(0);
    expect(plan.aborted).toBe(false);
  });
});

describe('报告输出', () => {
  // 6 条里 2 条不可达（占比 33% < 50% 阈值），确保这组用例走的是「不熔断」分支。
  const plan = buildRunPlan([
    entry('dead-blog', { first: dead, second: dead }),
    entry('back-blog', { unavailable: true, first: { ok: true, status: 200 } }),
    entry('risky-blog', { first: restricted403 }),
    entry('leak', { url: 'https://user:hunter2@leak.example/secret?token=abc', first: dead, second: dead }),
    entry('ok-1'),
    entry('ok-2'),
  ]);

  it('summary 计数自洽', () => {
    expect(plan.summary).toMatchObject({
      checked: 6,
      dead: 2,
      marks: 2,
      restores: 1,
      restricted: 1,
      writes: 3,
      aborted: false,
    });
  });

  it('飞书正文含表头计数与逐条改动，且 URL 凭据被脱敏', () => {
    const text = planToFeishuText(plan);
    expect(text).toContain('检查 6');
    expect(text).toContain('标记 2');
    expect(text).toContain('dead-blog');
    expect(text).toContain('back-blog');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('token=abc');
    expect(text).toContain('***');
  });

  it('DRY RUN 与熔断各有明确措辞', () => {
    expect(planToFeishuText(plan, { dryRun: true })).toContain('DRY RUN');
    const aborted = buildRunPlan([
      entry('a', { first: dead, second: dead }),
      entry('b', { first: dead, second: dead }),
      entry('c', { first: dead, second: dead }),
      entry('d', { first: dead, second: dead }),
    ]);
    expect(planToFeishuText(aborted)).toContain('熔断');
  });

  it('Actions 表格行覆盖全部条目', () => {
    const rows = planToRows(plan);
    expect(rows).toHaveLength(6);
    expect(Object.keys(rows[0]).join('|')).toBe('文件名|站点|探测|复测|动作|备注');
    expect(rows.map((r) => r.动作)).toContain('标记失联');
    expect(rows.map((r) => r.动作)).toContain('受限冻结');
  });
});
