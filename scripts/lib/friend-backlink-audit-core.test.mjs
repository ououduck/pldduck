// @vitest-environment node
/**
 * 反链巡检的纯函数：分类口径与飞书汇总文案。
 *
 * 2026-11 用户要求：检测不到反链**只发飞书通知，不删除友链**；
 * 检测入口优先用记录里的友链页面地址（backlinkUrl），没填才回落站点首页。
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
    { name: '正常站', host: 'ok.example', status: BACKLINK_AUDIT_STATUS.OK, checkedVia: 'backlink' },
    {
      name: '漏挂站',
      host: 'missing.example',
      status: BACKLINK_AUDIT_STATUS.MISSING,
      method: '渲染',
      page: 'https://missing.example/links',
      checkedVia: 'backlink',
    },
    {
      name: '打不开站',
      host: 'down.example',
      status: BACKLINK_AUDIT_STATUS.UNCERTAIN,
      reason: 'HTTP 502',
      checkedVia: 'backlink',
    },
  ];

  it('统计正常 / 未检测到 / 无法判定', () => {
    expect(summariseAudit(records)).toMatchObject({ checked: 3, ok: 1 });
    expect(summariseAudit(records).missing).toHaveLength(1);
    expect(summariseAudit(records).uncertain).toHaveLength(1);
    expect(summariseAudit(records).unconfigured).toHaveLength(0);
  });

  it('未填友链页面地址（回落首页检测）单独成组', () => {
    const withHome = [...records, { name: '没填地址站', host: 'legacy.example', status: 'ok', checkedVia: 'home' }];
    const summary = summariseAudit(withHome);
    expect(summary.unconfigured.map((record) => record.host)).toEqual(['legacy.example']);
  });

  it('飞书文案分组列出未检测到与无法判定，正常站不出现', () => {
    const { text } = renderAuditFeishuText({ records, date: '2026-11-13' });
    expect(text).toContain('检查 3 条：正常 1 / 未检测到 1 / 无法判定 1');
    expect(text).toContain('未检测到反链：');
    expect(text).toContain('漏挂站（missing.example）— 渲染，检测页面 https://missing.example/links');
    expect(text).toContain('无法判定');
    expect(text).toContain('打不开站（down.example）— HTTP 502');
    expect(text).not.toContain('正常站');
  });

  it('文案明确「只通知、不删除」，避免误以为友链已被下架', () => {
    const { text } = renderAuditFeishuText({ records, date: '2026-11-13' });
    expect(text).toContain('仅通知，不会自动删除或下架任何友链');
  });

  it('未填友链页面地址的站点进报告，提示去 CMS 补填', () => {
    const { text } = renderAuditFeishuText({
      records: [{ name: '老站', host: 'legacy.example', status: BACKLINK_AUDIT_STATUS.OK, checkedVia: 'home' }],
      date: '2026-11-13',
    });
    expect(text).toContain('未填写友链页面地址');
    expect(text).toContain('- 老站（legacy.example）');
  });

  it('全部正常时文案只有汇总行，不出现三个分组标题', () => {
    const { text } = renderAuditFeishuText({
      records: [
        {
          name: '正常站',
          host: 'ok.example',
          status: BACKLINK_AUDIT_STATUS.OK,
          checkedVia: 'backlink',
        },
      ],
      date: '2026-11-13',
    });
    expect(text).toContain('检查 1 条：正常 1 / 未检测到 0 / 无法判定 0');
    expect(text).not.toContain('未检测到反链：');
    expect(text).not.toContain('无法判定（');
    expect(text).not.toContain('未填写友链页面地址');
  });
});
