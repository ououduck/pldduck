/**
 * friend-backlink-audit-core.mjs — 反链巡检的纯函数（分类 + 飞书汇总文案）。
 *
 * 巡检只读：逐个检查 friends/ 里的站点是否仍挂着本站反链，把「未检测到」与
 * 「无法判定」的站点汇总推给站长，不写仓库、不改 Issue、不触发部署
 * （2026-11 用户明确要求：检测不到反链**只发飞书通知，不删除友链**）。
 *
 * 检测入口优先用记录里的 `backlinkUrl`（友链页面地址），为空才回落站点首页；
 * 「没有配置友链页面地址」的条目单独统计，提醒站长补填（见 ai-rules/friends.md 规则 17）。
 */

/** 巡检结论。 */
export const BACKLINK_AUDIT_STATUS = Object.freeze({
  OK: 'ok',
  MISSING: 'missing',
  UNCERTAIN: 'uncertain',
});

/**
 * 把一条检测结论归入巡检状态。
 * - found → ok
 * - not-found / js-only → missing（页面没挂链）
 * - offsite / restricted / fetch-error → uncertain（站点跳转或拒绝自动化，不能断定没挂链）
 * @param {object} [result] findBacklink / findBacklinkInAnchors / buildTransportVerdict 的结果
 * @returns {{ status: string, reason: string }}
 */
export const classifyAuditVerdict = (result) => {
  const verdict = result?.verdict;
  if (verdict === 'found') return { status: BACKLINK_AUDIT_STATUS.OK, reason: '' };
  if (verdict === 'not-found' || verdict === 'js-only') {
    return { status: BACKLINK_AUDIT_STATUS.MISSING, reason: result?.message || '' };
  }
  return {
    status: BACKLINK_AUDIT_STATUS.UNCERTAIN,
    reason: result?.message || (verdict ? `检测结论：${verdict}` : '检测未执行'),
  };
};

/**
 * 汇总巡检结果。
 *
 * `unconfigured` 是「这条记录还没填友链页面地址，本轮按站点首页检测」的清单 ——
 * 它们**不是**异常结论（只有当首页也没挂链时才会同时出现在 missing 里），
 * 单独列出来是为了提醒站长补齐地址，让下一轮检测真正落到对方挂链的页面上。
 * @param {Array<{ status: string, checkedVia?: string }>} records
 * @returns {{ checked: number, ok: number, missing: Array<object>, uncertain: Array<object>, unconfigured: Array<object> }}
 */
export const summariseAudit = (records = []) => {
  const missing = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.MISSING);
  const uncertain = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.UNCERTAIN);
  const unconfigured = records.filter((record) => record.checkedVia === 'home');
  const ok = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.OK).length;
  return { checked: records.length, ok, missing, uncertain, unconfigured };
};

/**
 * 生成飞书汇总文案（纯文字、无 Emoji，见 ai-rules/feishu-webhook.md 规则 6）。
 * @param {object} input
 * @param {Array<{ name: string, host: string, status: string, page?: string, checkedVia?: string, reason?: string, method?: string }>} input.records
 * @param {string} [input.date] 报告日期（默认由调用方传入，保证可测试）
 * @returns {{ text: string, summary: ReturnType<typeof summariseAudit> }}
 */
export const renderAuditFeishuText = ({ records = [], date = '' }) => {
  const summary = summariseAudit(records);
  const lines = [
    `【友链反链巡检】${date}`.trim(),
    `检查 ${summary.checked} 条：正常 ${summary.ok} / 未检测到 ${summary.missing.length} / 无法判定 ${summary.uncertain.length}`,
    // 明确写出「只通知不删除」，避免收到通知时误以为友链已被下架。
    '处理方式：仅通知，不会自动删除或下架任何友链（下架请在 Pages CMS 人工处理）。',
  ];

  if (summary.missing.length > 0) {
    lines.push('', '未检测到反链：');
    for (const record of summary.missing) {
      const where = record.page ? `，检测页面 ${record.page}` : '';
      lines.push(`- ${record.name}（${record.host}）${record.method ? `— ${record.method}` : ''}${where}`);
    }
  }

  if (summary.uncertain.length > 0) {
    lines.push('', '无法判定（站点打不开/受限/跳转异常，需人工确认）：');
    for (const record of summary.uncertain) {
      const where = record.page ? `，检测页面 ${record.page}` : '';
      lines.push(`- ${record.name}（${record.host}）— ${record.reason || '未知原因'}${where}`);
    }
  }

  if (summary.unconfigured.length > 0) {
    lines.push('', '未填写友链页面地址（本轮按站点首页检测，建议在 Pages CMS 补填）：');
    for (const record of summary.unconfigured) {
      lines.push(`- ${record.name}（${record.host}）`);
    }
  }

  return { text: lines.join('\n'), summary };
};
