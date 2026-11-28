/**
 * 说说（ShuoShuo）的分页口径：构建期与前端共用同一份常量。
 *
 * 为什么单独成文件：SSG 脚本（scripts/ssg.mjs，Node ESM）与页面组件
 * （src/pages/ShuoShuo.tsx，TS）都要用它 —— 两边必须是同一个数字，
 * 否则预渲染出的 HTML 文件数与前端分页对不上（第 N 页直访会 404）。
 *
 * 设计：说说**不再逐条生成 HTML**。全站只有「每 10 篇说说一个 HTML 文件」，
 * 逐条独立链接已取消（2026-11 用户要求减少构建产物数量）。
 */

/** 每页说说条数（= 每个预渲染 HTML 文件承载的条数）。 */
export const SHUOSHUO_PER_PAGE = 10;

/** 说说列表首屏路径（第 1 页）。 */
export const SHUOSHUO_LIST_PATH = '/shuoshuo';

/**
 * 第 N 页的路径：第 1 页就是列表页本身（/shuoshuo），
 * 其余页为 /shuoshuo/page/<n>，每页都是一个真实存在的静态 HTML。
 */
export const shuoshuoPagePath = (page) => {
  const pageNumber = Math.max(1, Math.trunc(Number(page) || 1));
  return pageNumber === 1 ? SHUOSHUO_LIST_PATH : `${SHUOSHUO_LIST_PATH}/page/${pageNumber}`;
};

/** 总页数（空列表时为 1，保证 /shuoshuo 永远有一页）。 */
export const shuoshuoPageCount = (totalItems) =>
  Math.max(1, Math.ceil((Number.isFinite(Number(totalItems)) ? Number(totalItems) : 0) / SHUOSHUO_PER_PAGE));
