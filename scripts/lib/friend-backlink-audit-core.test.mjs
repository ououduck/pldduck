// @vitest-environment node
/**
 * 反链巡检的纯函数：分类口径与飞书汇总文案。
 */
import { describe, it, expect } from 'vitest';
import {
  BACKLINK_AUDIT_STATUS,
  classifyAuditVerdict,
  renderAuditFeishuText,
  summariseAudit,
} from './friend-backlink-audit-core.mjs';

describe('classifyAuditVerdict', () => {
  it('found → ok', () => {
    expect(classifyAuditVerdict({ verdict: 'found', message: '命中' })).toEqual({
      status: BACKLINK_AUDIT_STATUS.OK,
      reason: '',
    });
  });

  it('not-found / js-only → missing（页面确实没挂链）', () => {
    for (const verdict of ['not-found', 'js-only']) {
      const result = classifyAuditVerdict({ verdict, message: '没找到' });
      expect(result.status, verdict).toBe(BACKLINK_AUDIT_STATUS.MISSING);
      expect(result.reason).toBe('没找到');
    }
  });

  it('offsite / restricted / fetch-error → uncertain（不能断定没挂链）', () => {
    for (const verdict of ['offsite', 'restricted', 'fetch-error']) {
      expect(classifyAuditVerdict({ verdict, message: 'x' }).status, verdict).toBe(BACKLINK_AUDIT_STATUS.UNCERTAIN);
    }
    expect(classifyAuditVerdict(undefined).status).toBe(BACKLINK_AUDIT_STATUS.UNCERTAIN);
  });
});

describe('summariseAudit / renderAuditFeishuText', () => {
  const records = [
    { name: '正常站', host: 'ok.example', status: BACKLINK_AUDIT_STATUS.OK },
    { name: '漏挂站', host: 'missing.example', status: BACKLINK_AUDIT_STATUS.MISSING, method: '渲染' },
    { name: '打不开站', host: 'down.example', status: BACKLINK_AUDIT_STATUS.UNCERTAIN, reason: 'HTTP 502' },
  ];

  it('统计正常 / 未检测到 / 无法判定', () => {
    expect(summariseAudit(records)).toMatchObject({ checked: 3, ok: 1 });
    expect(summariseAudit(records).missing).toHaveLength(1);
    expect(summariseAudit(records).uncertain).toHaveLength(1);
  });

  it('飞书文案分组列出未检测到与无法判定，正常站不出现', () => {
    const { text } = renderAuditFeishuText({ records, date: '2026-11-13' });
    expect(text).toContain('检查 3 条：正常 1 / 未检测到 1 / 无法判定 1');
    expect(text).toContain('未检测到反链：');
    expect(text).toContain('漏挂站（missing.example）— 渲染');
    expect(text).toContain('无法判定');
    expect(text).toContain('打不开站（down.example）— HTTP 502');
    expect(text).not.toContain('正常站');
  });

  it('全部正常时文案只有汇总行，不出现两个分组标题', () => {
    const { text } = renderAuditFeishuText({
      records: [{ name: '正常站', host: 'ok.example', status: BACKLINK_AUDIT_STATUS.OK }],
      date: '2026-11-13',
    });
    expect(text).toContain('检查 1 条：正常 1 / 未检测到 0 / 无法判定 0');
    expect(text).not.toContain('未检测到反链：');
    expect(text).not.toContain('无法判定（');
  });
});
