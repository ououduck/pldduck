/**
 * 说说路径与摘要口径：列表、详情与 SEO 共用同一套纯函数。
 */

/** 说说列表页路径。 */
export const SHUOSHUO_LIST_PATH = '/shuoshuo';

/** 单条说说的详情页路径（id 来自 shuoshuo/*.md 的 frontmatter）。 */
export const shuoshuoPath = (id: string): string => `${SHUOSHUO_LIST_PATH}/${encodeURIComponent(id)}`;

/** meta description 的长度口径：与 SEO 审计（seo-audit.mjs）一致。 */
const DESCRIPTION_MIN_CHARS = 50;
const DESCRIPTION_MAX_CHARS = 160;

/**
 * 说说的 meta description：短内容（说说常常只有几个字）单独用作描述既不利于搜索，
 * 也不符合 SEO 审计的长度口径（50–160），因此不足下限时补一句页面上下文。
 *
 * 拼接后**必须仍然满足下限**：只加一次后缀可能还是太短（「恐怖」+ 一句 = 20 余字），
 * 所以按需要叠加说明句，直到达标或到上限为止 —— 不用 while 拼无限长，
 * 候选句用完就返回当前结果（宁可短一点也不超上限）。
 *
 * 纯函数：同样的正文永远得到同样的描述（SSG 与水合一致，不依赖时钟/随机）。
 */
export const buildShuoShuoDescription = ({
  excerpt,
  authorName,
  date,
  siteTitle,
}: {
  excerpt: string;
  authorName: string;
  date: string;
  siteTitle: string;
}): string => {
  const text = String(excerpt ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const core = text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text;
  const base = core ? `${authorName} 的说说（${date}）：${core}` : `${authorName} 于 ${date} 发布的一条说说`;
  if (base.length >= DESCRIPTION_MIN_CHARS) {
    return base.length > DESCRIPTION_MAX_CHARS ? base.slice(0, DESCRIPTION_MAX_CHARS) : base;
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
