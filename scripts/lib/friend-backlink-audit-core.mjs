/**
 * friend-backlink-audit-core.mjs — 反链巡检的纯函数（分类 + 飞书汇总文案）。
 *
 * 巡检只读：逐个检查 friends/ 里的站点是否仍挂着本站反链，把「未检测到」与
 * 「无法判定」的站点汇总推给站长，不写仓库、不改 Issue、不触发部署。
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
 * @param {Array<{ status: string }>} records
 * @returns {{ checked: number, ok: number, missing: Array<object>, uncertain: Array<object> }}
 */
export const summariseAudit = (records = []) => {
  const missing = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.MISSING);
  const uncertain = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.UNCERTAIN);
  const ok = records.filter((record) => record.status === BACKLINK_AUDIT_STATUS.OK).length;
  return { checked: records.length, ok, missing, uncertain };
};

/**
 * 生成飞书汇总文案。
 * @param {object} input
 * @param {Array<{ name: string, host: string, status: string, reason?: string, method?: string }>} input.records
 * @param {string} [input.date] 报告日期（默认由调用方传入，保证可测试）
 * @returns {{ text: string, summary: ReturnType<typeof summariseAudit> }}
 */
export const renderAuditFeishuText = ({ records = [], date = '' }) => {
  const summary = summariseAudit(records);
  const lines = [
    `【友链反链巡检】${date}`.trim(),
    `检查 ${summary.checked} 条：正常 ${summary.ok} / 未检测到 ${summary.missing.length} / 无法判定 ${summary.uncertain.length}`,
  ];

  if (summary.missing.length > 0) {
    lines.push('', '未检测到反链：');
    for (const record of summary.missing) {
      lines.push(`- ${record.name}（${record.host}）${record.method ? `— ${record.method}` : ''}`);
    }
  }

  if (summary.uncertain.length > 0) {
    lines.push('', '无法判定（站点打不开/受限/跳转异常，需人工确认）：');
    for (const record of summary.uncertain) {
      lines.push(`- ${record.name}（${record.host}）— ${record.reason || '未知原因'}`);
    }
  }

  return { text: lines.join('\n'), summary };
};
