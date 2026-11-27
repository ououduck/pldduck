/**
 * discussion-core.mjs — 「一条内容 = 一个 Discussion」的纯函数层（src 与 scripts 共享）。
 *
 * 为什么要有这一层：GitHub 的邮件通知粒度是 **Discussion 级** —— 谁在某个
 * discussion 里留过言就会被自动 watch，之后该 discussion 下**每条**评论都会
 * 给他发邮件，没有 per-comment / per-reply 订阅可配（giscus 也没有这个能力）。
 * 所以留言板与说说必须从「一个大 Discussion 装全部内容」改成
 * 「一份留言 / 一条说说 = 一个独立 Discussion」：访客只订阅自己参与的那一份。
 *
 * 本文件只做纯计算（解析 GraphQL 结果、生成标题、排序、可见性判定、URL 拼装），
 * 网络与文件 IO 分别由 scripts/fetch-discussions.mjs 与迁移脚本负责。
 * 放在 src/utils 是因为它同时被前端（详情页拼路径）与构建脚本（生成 discussions.json）消费，
 * 与 headings-core.mjs / markdown-core.mjs 同一模式。
 */

/** 说说的 Discussion 编号 → 站内详情路径前缀。 */
export const DISCUSSION_SURFACES = Object.freeze({
  SHUOSHUO: 'shuoshuo',
  GUESTBOOK: 'guestbook',
});

/** 自动生成标题时的长度上限（GitHub 标题上限 1024，这里取足够短的可读长度）。 */
export const MAX_AUTO_TITLE_CHARS = 60;

/**
 * @typedef {object} DiscussionEntry
 * @property {number} number
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {{ login: string, avatarUrl: string, url: string }} author
 * @property {number} commentCount
 * @property {number} reactionCount
 * @property {string} url
 */

/**
 * @typedef {DiscussionEntry & { excerpt: string, images: string[] }} DiscussionListItem
 */

/**
 * 迁移标记与迁移署名行的识别/剥离。
 *
 * 迁移过来的 Discussion 正文形如：
 *   <!-- pldduck-migrated:<源评论id> -->
 *
 *   原正文
 *
 *   > 由 @xxx · 原发布于 YYYY-MM-DD 的旧说说迁移
 *
 * 这两段是**给机器与溯源用**的，不是内容：HTML 注释在 Markdown 里会被原样当文本
 * 显示（react-markdown 不渲染原始 HTML 时会输出成字面量），必须剥掉；
 * 署名保留在详情页（用样式化的方式由页面决定），这里只负责从「摘要/标题」里剔除。
 */
const MIGRATION_MARKER_PATTERN = /<!--\s*pldduck-migrated:[^\s>]+\s*-->/g;
const MIGRATION_BYLINE_PATTERN = /^>\s*由\s+@[^\s·]+\s*·\s*原发布于\s*\d{4}-\d{2}-\d{2}\s*的旧(?:说说|留言)迁移\s*$/;

/**
 * 去掉迁移标记与署名行，得到「真正的内容正文」。
 * 页面上渲染的正文、列表摘要、标题派生都必须用它。
 * @param {string | null | undefined} body
 * @returns {string}
 */
export const stripMigrationArtifacts = (body) =>
  String(body ?? '')
    .replace(MIGRATION_MARKER_PATTERN, '')
    .split(/\r?\n/)
    .filter((line) => !MIGRATION_BYLINE_PATTERN.test(line.trim()))
    .join('\n')
    .trim();

/**
 * 取出迁移署名（详情页展示原作者用）；不是迁移内容则返回 null。
 * @param {string | null | undefined} body
 * @returns {{ author: string, date: string } | null}
 */
export const readMigrationByline = (body) => {
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^>\s*由\s+@([^\s·]+)\s*·\s*原发布于\s*(\d{4}-\d{2}-\d{2})/);
    if (match) return { author: match[1], date: match[2] };
  }
  return null;
};

/**
 * 从正文派生标题：取第一段非空文本，剥离 Markdown 标记后截断。
 *
 * 空正文不能返回空标题（GitHub 拒绝空标题）：回落为「（无标题）」。
 * @param {string | null | undefined} body
 * @param {number} [maxChars]
 * @returns {string}
 */
export const deriveDiscussionTitle = (body, maxChars = MAX_AUTO_TITLE_CHARS) => {
  const text = stripMigrationArtifacts(body);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      // Markdown 装饰：标题井号、列表符号、引用符、图片/链接的语法糖。
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .trim();
    if (!line) continue;
    const chars = [...line];
    return chars.length <= maxChars ? line : `${chars.slice(0, maxChars).join('')}…`;
  }
  return '（无标题）';
};

/**
 * 归一化一条 GraphQL discussion 节点为站内条目。
 *
 * 判定为不可用的情况一律返回 null（调用方过滤）：缺 number / 没有可展示内容。
 * @param {any} node GraphQL Discussion 节点
 * @returns {DiscussionEntry | null}
 */
export const normalizeDiscussionNode = (node) => {
  const number = Number(node?.number);
  if (!Number.isFinite(number) || number <= 0) return null;

  const body = typeof node?.body === 'string' ? node.body : '';
  const title = (typeof node?.title === 'string' && node.title.trim()) || deriveDiscussionTitle(body);
  const author = {
    login: String(node?.author?.login ?? ''),
    avatarUrl: String(node?.author?.avatarUrl ?? ''),
    url: String(node?.author?.url ?? ''),
  };

  return {
    number,
    title,
    body,
    createdAt: String(node?.createdAt ?? ''),
    updatedAt: String(node?.updatedAt ?? node?.createdAt ?? ''),
    author,
    // totalCount 缺失时按 0 处理：列表上的「N 条回复」只是提示，不该因此丢条目。
    commentCount: Number.isFinite(Number(node?.comments?.totalCount)) ? Number(node.comments.totalCount) : 0,
    reactionCount: Number.isFinite(Number(node?.reactions?.totalCount)) ? Number(node.reactions.totalCount) : 0,
    url: String(node?.url ?? ''),
  };
};

/**
 * 已标记 spam 的 discussion 不进入站内列表。
 *
 * Discussion 类型没有公开的 isSpam 字段（请求它会 undefinedField），被删除/被判定
 * spam 的讨论 GraphQL 本就不返回；这里保留判断作为防御 —— 字段偶尔出现时仍能挡住。
 * @param {any} node
 * @returns {boolean}
 */
const isVisibleNode = (node) => Boolean(node) && node.isSpam !== true;

/**
 * 从 Markdown 正文里提取图片地址（只认 http(s) / 站内绝对路径）。
 *
 * 构建期算好写进 generated/discussions.json：说说列表要在客户端展示图片墙，
 * 前端不该为此再引一个 Markdown 解析器（list chunk 体积敏感）。
 * @param {string | null | undefined} body
 * @returns {string[]}
 */
export const extractDiscussionImages = (body) => {
  /** @type {string[]} */
  const images = [];
  const pattern = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const match of String(body ?? '').matchAll(pattern)) {
    const url = match[1];
    if (!/^(?:https?:\/\/|\/)/i.test(url)) continue;
    if (images.includes(url)) continue;
    images.push(url);
  }
  return images;
};

/**
 * 把一次 GraphQL 查询结果归一化成条目列表（按创建时间倒序，最新在前）。
 * @param {any[] | null | undefined} nodes
 * @returns {DiscussionListItem[]}
 */
export const normalizeDiscussionNodes = (nodes = []) =>
  (Array.isArray(nodes) ? nodes : [])
    .filter(isVisibleNode)
    .map(normalizeDiscussionNode)
    .filter((item) => item !== null)
    .map((item) => ({
      ...item,
      excerpt: buildDiscussionExcerpt(item.body),
      images: extractDiscussionImages(item.body),
    }))
    // 时间戳相同时按编号倒序，保证同一份输入产出同一顺序（SSG 确定性）。
    .sort((a, b) => {
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return Number.isFinite(delta) && delta !== 0 ? delta : b.number - a.number;
    });

/**
 * 站内详情 URL（相对路径，交给 siteUrl 工具补 base path）。
 * @param {'shuoshuo'|'guestbook'} surface
 * @param {number | string} number
 * @returns {string}
 */
export const discussionPath = (surface, number) => `/${surface}/${Number(number)}`;

/**
 * 详情页 meta description：短内容（说说常常只有几个字）单独用作描述既不利于搜索
 * 也不符合 SEO 审计的长度口径（50–160），因此不足下限时补一句站点/页面上下文。
 *
 * 拼接后**必须仍然满足下限**：只加一次后缀可能还是太短（「恐怖」+28 字后缀 = 30），
 * 所以按需要叠加说明句，直到达标或到上限（160）为止 —— 不用 while 拼无限长，
 * 候选句用完就返回当前结果（宁可短一点也不超上限）。
 *
 * 纯函数：同样的正文永远得到同样的描述（SSG 与水合一致，不依赖时钟/随机）。
 * @param {object} input
 * @param {string} input.excerpt 正文摘要
 * @param {string} input.siteTitle 站点名
 * @param {'shuoshuo'|'guestbook'} input.surface
 * @param {number} [input.minChars]
 * @returns {string}
 */
export const buildDiscussionMetaDescription = ({ excerpt, siteTitle, surface, minChars = 50 }) => {
  const base = String(excerpt ?? '').trim();
  if (base.length >= minChars) return base;

  const isGuestbook = surface === 'guestbook';
  // 候选后缀按「先具体、后泛化」排列，拼接时按需追加。中文句子很短，
  // 两句常常还不够 50 字，所以每类都备足三条（用完仍不足则接受当前结果）。
  const candidates = isGuestbook
    ? [
        `${siteTitle}留言板上的一份留言与它的回复。`,
        '在留言板留下你的足迹，登录 GitHub 账号即可参与讨论，闲聊、建议与问题反馈都欢迎。',
        '每条留言是独立讨论，只有你参与过的那一份有后续回复时才会通知你。',
      ]
    : [
        `${siteTitle}说说里的一条短动态。`,
        '用一句话、一张图记录当下的想法与生活片段，最新动态排在最前。',
        '每条说说是独立讨论，只有你留过言的那一条有后续回复时才会通知你。',
      ];

  let text = base;
  for (const sentence of candidates) {
    if (text.length >= minChars) break;
    const joiner = text ? (text.endsWith('。') ? '' : ' ') : '';
    const next = `${text}${joiner}${sentence}`.trim();
    if (next.length > 160) break;
    text = next;
  }
  return text;
};

/**
 * 在 GitHub 上新建一个 discussion 的网页地址（访客发留言 / 站长发说说都用它）。
 *
 * `category` 用分类 **slug**：仓库里中文分类的 slug 就是分类名本身（已核实）。
 * 该入口直达「新建讨论」表单，prefill 不了正文 —— 与 Issue 表单不同，
 * GitHub Discussions 的 new 页不支持 body 查询参数。
 * @param {object} input
 * @param {string} input.repo owner/repo
 * @param {string} input.categorySlug 分类 slug（= 分类名）
 * @returns {string}
 */
export const buildNewDiscussionUrl = ({ repo, categorySlug }) => {
  const [owner, name] = String(repo ?? '').split('/');
  if (!owner || !name) throw new TypeError('repo 必须是 owner/repo');
  if (!categorySlug) throw new TypeError('categorySlug 不能为空');
  return `https://github.com/${owner}/${name}/discussions/new?category=${encodeURIComponent(categorySlug)}`;
};

/**
 * 列表页摘要：把 Markdown 正文压成一行纯文本预览（不引入完整 Markdown 解析器）。
 * @param {string} body
 * @param {number} [maxChars]
 * @returns {string}
 */
export const buildDiscussionExcerpt = (body, maxChars = 140) => {
  const text = stripMigrationArtifacts(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  return chars.length <= maxChars ? text : `${chars.slice(0, maxChars).join('')}…`;
};
