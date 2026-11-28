/**
 * 说说路径与 SEO 口径（前端侧）。
 *
 * 分页口径与构建期共用 `config/shuoshuo.mjs`（同一个数字决定 SSG 生成几个
 * HTML 文件），这里只做前端可用的再导出与文案工具。
 */

import { SHUOSHUO_LIST_PATH, SHUOSHUO_PER_PAGE, shuoshuoPageCount, shuoshuoPagePath } from '@config/shuoshuo.mjs';

export { SHUOSHUO_LIST_PATH, SHUOSHUO_PER_PAGE, shuoshuoPageCount, shuoshuoPagePath };

/** meta description 的长度口径：与 SEO 审计（seo-audit.mjs）一致。 */
const DESCRIPTION_MIN_CHARS = 50;
const DESCRIPTION_MAX_CHARS = 160;

/**
 * 说说页的 meta description：短内容（说说常常只有几个字）单独用作描述既不利于搜索，
 * 也不符合 SEO 审计的长度口径（50–160），因此不足下限时补一句页面上下文。
 *
 * 纯函数：同样的输入永远得到同样的描述（SSG 与水合一致，不依赖时钟/随机）。
 */
interface ShuoShuoDescriptionInput {
  /** 页面里第一条说说的正文（没有内容时不传）。 */
  excerpt?: string;
  /** 第一条说说的作者名。 */
  authorName?: string;
  /** 第一条说说的日期。 */
  date?: string;
  siteTitle: string;
  page?: number;
  totalPages?: number;
}

export const buildShuoShuoDescription = ({
  excerpt,
  authorName,
  date,
  siteTitle,
  page = 1,
  totalPages = 1,
}: ShuoShuoDescriptionInput): string => {
  const pageSuffix = totalPages > 1 ? `第 ${page} / ${totalPages} 页` : '';
  const text = String(excerpt ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const core = text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text;
  // 拼接时把「分页」与「日期」并进同一对括号，避免出现「（第 2 / 2 页）（2026-08-14）」
  // 这种括号连排的读感。
  const context = [pageSuffix, date ?? ''].filter(Boolean).join(' · ');
  const base = core
    ? `${authorName ?? siteTitle} 的说说（${context}）：${core}`
    : `${siteTitle} 说说：类似朋友圈的短动态分享，用一句话、一张图记录当下的想法与生活片段${pageSuffix ? `（${pageSuffix}）` : ''}。`;

  if (base.length >= DESCRIPTION_MIN_CHARS) {
    return base.length > DESCRIPTION_MAX_CHARS ? `${base.slice(0, DESCRIPTION_MAX_CHARS - 1)}…` : base;
  }

  const candidates = [
    `${siteTitle}说说里的一条短动态。`,
    '用一句话、一张图记录当下的想法与生活片段，最新动态排在最前。',
  ];

  let result = base;
  for (const sentence of candidates) {
    if (result.length >= DESCRIPTION_MIN_CHARS) break;
    const joiner = result.endsWith('。') ? '' : ' ';
    const next = `${result}${joiner}${sentence}`.trim();
    if (next.length > DESCRIPTION_MAX_CHARS) break;
    result = next;
  }
  return result;
};
