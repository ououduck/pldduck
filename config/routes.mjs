/**
 * 路由唯一数据源：新增/删除页面只改这里。
 *
 * 消费方（全部从此模块派生，不再各自维护清单）：
 * - src/App.tsx                    路由表与懒加载组件映射
 * - src/utils/preload.ts           悬停预加载的 chunk 键（键集合由测试断言一致）
 * - src/utils/siteUrl.ts           相对 base path 推断标记（BASE_ROUTE_MARKERS）
 * - scripts/ssg.mjs                预渲染静态页与页面级 JSON-LD
 * - scripts/generate-site-data.mjs sitemap-pages.xml 条目
 * - public/sw.js                   离线导航的 SPA 兜底模式（构建期由
 *                                  scripts/lib/sw-version.mjs 注入 ROUTES:BEGIN/END 标记区）
 *
 * 字段约定：
 * - path      react-router 路径（'/'、'/post/:id'、'*'）
 * - segment   URL 首段；'' 表示首页，null 表示通配（不参与任何枚举）
 * - preload   悬停时预加载该页 chunk（仅静态页适用，键须与 preload.ts 一致）
 * - sw        离线导航时允许用应用壳（首页）兜底渲染
 * - ssg       构建期预渲染方式：'static' 单页 / 'static-home' 首页 / 'posts'·'shuoshuo' 逐条 / 'not-found'
 * - seo       静态页页面级 SEO；title 只写前缀，站点名后缀由 ssg.mjs 用 siteConfig.title 拼接，
 *             缺省表示该页 title/description 完全由页面组件的 Seo 输出
 * - sitemap   进入 sitemap-pages.xml 的条目（文章与说说详情由各自子 sitemap 负责）
 */

/**
 * @typedef {Object} RouteDef
 * @property {string} path
 * @property {string | null} segment
 * @property {boolean} [preload]
 * @property {boolean} [sw]
 * @property {'static' | 'static-home' | 'posts' | 'shuoshuo' | 'not-found'} [ssg]
 * @property {{ title?: string, description?: string, schemaType: string, schemaFromSeo?: boolean }} [seo]
 * @property {{ changefreq: string, priority: string }} [sitemap]
 */

/** @type {RouteDef[]} */
export const ROUTES = [
  {
    path: '/',
    segment: '',
    sw: true,
    ssg: 'static-home',
    sitemap: { changefreq: 'daily', priority: '1.0' },
  },
  {
    path: '/post/:id',
    segment: 'post',
    sw: true,
    ssg: 'posts',
  },
  {
    path: '/archive',
    segment: 'archive',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'CollectionPage', schemaFromSeo: true },
    sitemap: { changefreq: 'daily', priority: '0.9' },
  },
  {
    path: '/tags',
    segment: 'tags',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'CollectionPage', schemaFromSeo: true },
    sitemap: { changefreq: 'weekly', priority: '0.8' },
  },
  {
    path: '/stats',
    segment: 'stats',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: {
      title: '统计',
      description: 'D-blog 站点数据统计面板，展示文章总数、累计字数、分类与标签分布、图片与代码规模等核心内容数据。',
      schemaType: 'WebPage',
    },
    sitemap: { changefreq: 'weekly', priority: '0.6' },
  },
  {
    path: '/friends',
    segment: 'friends',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'CollectionPage', schemaFromSeo: true },
    sitemap: { changefreq: 'weekly', priority: '0.7' },
  },
  {
    path: '/shuoshuo',
    segment: 'shuoshuo',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'CollectionPage', schemaFromSeo: true },
    sitemap: { changefreq: 'weekly', priority: '0.6' },
  },
  {
    path: '/shuoshuo/:id',
    segment: 'shuoshuo',
    sw: true,
    ssg: 'shuoshuo',
  },
  {
    path: '/guestbook',
    segment: 'guestbook',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'WebPage', schemaFromSeo: true },
    sitemap: { changefreq: 'weekly', priority: '0.5' },
  },
  {
    path: '/about',
    segment: 'about',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'ProfilePage', schemaFromSeo: true },
    sitemap: { changefreq: 'monthly', priority: '0.7' },
  },
  {
    path: '/cover',
    segment: 'cover',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: {
      title: '封面生成',
      description:
        '在线免费生成精美博客文章封面图片，支持自定义文字、图标与渐变背景，适配多种社交分享比例，开箱即用无需登录。',
      schemaType: 'WebApplication',
    },
    sitemap: { changefreq: 'monthly', priority: '0.5' },
  },
  {
    path: '/watermark',
    segment: 'watermark',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: {
      title: '水印工具',
      description:
        '在浏览器中免费为图片添加文字水印，支持自定义文字样式、实时预览与本地导出，无需上传文件，保护图片版权。',
      schemaType: 'WebApplication',
    },
    sitemap: { changefreq: 'monthly', priority: '0.5' },
  },
  {
    path: '/search',
    segment: 'search',
    preload: true,
    sw: true,
    ssg: 'static',
    seo: { schemaType: 'WebPage', schemaFromSeo: true },
    sitemap: { changefreq: 'monthly', priority: '0.5' },
  },
  {
    path: '*',
    segment: null,
    sw: false,
    ssg: 'not-found',
  },
];

/** 首页路径。 */
export const HOME_PATH = '/';

/** 404 通配路由。 */
export const NOT_FOUND_PATH = '*';

const segments = [...new Set(ROUTES.map((item) => item.segment).filter((item) => Boolean(item)))];

/**
 * 相对 base path 推断标记：存在列表页的段用裸前缀（/shuoshuo 同时命中列表与详情），
 * 只有详情页的段带尾斜杠（/post/），避免把 /poster 之类的路径误判为站内路由。
 */
export const BASE_ROUTE_MARKERS = segments.map((segment) =>
  ROUTES.some((item) => item.path === `/${segment}`) ? `/${segment}` : `/${segment}/`,
);

/** 需要悬停预加载的静态页路径集合（preload.ts 的键必须与此完全一致）。 */
export const PRELOADABLE_PATHS = ROUTES.filter((item) => item.preload).map((item) => item.path);

/** 逐条预渲染的内容页前缀（详情页 URL 与产物目录）。 */
export const CONTENT_PAGE_PREFIXES = ROUTES.filter((item) => item.ssg === 'posts' || item.ssg === 'shuoshuo').map(
  (item) => ({ kind: item.ssg, urlPrefix: `/${item.segment}/`, dirPrefix: `${item.segment}/` }),
);

/**
 * ssg.mjs 的静态页清单。path 为无前导斜杠的产物目录名；
 * title 在此只保留前缀，站点名后缀由 ssg.mjs 用 siteConfig.title 拼接（避免双源文案漂移）。
 */
export const SSG_STATIC_PAGES = ROUTES.filter((item) => item.ssg === 'static').map((item) => ({
  path: /** @type {string} */ (item.segment),
  title: item.seo?.title,
  description: item.seo?.description,
  schemaType: item.seo?.schemaType,
  schemaFromSeo: item.seo?.schemaFromSeo === true,
}));

/** generate-site-data.mjs 的 sitemap-pages.xml 条目（path 为站点根下的相对路径，'' 即首页）。 */
export const SITEMAP_PAGES = ROUTES.filter((item) => item.sitemap).map((item) => ({
  path: /** @type {string} */ (item.segment),
  changefreq: /** @type {string} */ (item.sitemap?.changefreq),
  priority: /** @type {string} */ (item.sitemap?.priority),
}));

/** 离线导航允许应用壳兜底的首段集合（不含首页与通配）。 */
export const SPA_ROUTE_SEGMENTS = segments.filter((segment) =>
  ROUTES.some((item) => item.segment === segment && item.sw),
);

/**
 * 生成 public/sw.js 中 SPA_ROUTE_PATTERNS 的源码文本，供构建期写入标记区。
 * 首页单独一条，其余首段合并为一条 alternation，匹配语义与手写版一致。
 */
export const buildServiceWorkerRoutePatternSource = () =>
  ['const SPA_ROUTE_PATTERNS = [', '  /^\\/$/,', `  /^\\/(?:${SPA_ROUTE_SEGMENTS.join('|')})(?:\\/|$)/,`, '];'].join(
    '\n',
  );
