// Vercount 站点计数（https://www.vercount.one/）：按官方公开接口上报当前页访问量，
// 并把返回的计数回填到对应的 span：
//   POST https://events.vercount.one/api/v2/log
//   body { url, isNewUv }（JSON），5s 超时
//   响应 { status: 'success', data: { site_pv, page_pv, site_uv } }
// 接口按 host + path 归一化计数（query / hash 不参与），UV 用一年期 first-party
// cookie vercount_uv_<host> 去重 —— 与官方脚本逐字段一致。
//
// 为什么不用官方 <script defer src="https://events.vercount.one/js">：
// 1. 该脚本是 IIFE，整页只执行一次。本站是 SSG + 客户端水合的 SPA，路由切换不重新
//    加载页面，官方脚本因此既不会为新路由上报，也不会回填，每篇文章的阅读量都会
//    停在首屏状态。
// 2. 脚本在 defer 阶段（React 渲染前）执行，并在首次回填时缓存 span 引用；文章页的
//    计数位此时尚未挂载，首次访问拿不到任何数字，之后也不会再查找。
// 所以改由本模块在 Layout 路由变化时调用同一套公开接口：等价于官方脚本在每次页面
// 加载时执行，适配 SPA 客户端导航，且每条路由只上报一次，避免重复计数。

const VERCUNT_API_URL = 'https://events.vercount.one/api/v2/log';
const VERCUNT_REQUEST_TIMEOUT_MS = 5000;
const VERCUNT_UV_COOKIE_PREFIX = 'vercount_uv_';
const VERCUNT_UV_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const VERCUNT_SPAN_ID_PREFIX = 'vercount_value_';
/** 计数未就绪时的占位文案：文章页 span 的初始内容，也用于判断「还没回填」。 */
export const VERCUNT_PENDING_TEXT = '加载中';
const VERCUNT_UNAVAILABLE_TEXT = '—';
// 回填重试帧数上限：等待路由退出动画结束后新 span 挂载，约 0.75s。
const VERCUNT_FILL_RETRY_FRAMES = 45;

// 站点级计数可跨路由复用；page_pv 属于当前路由，必须与缓存 URL 一致才回填。
const SITE_METRIC_KEYS = ['site_pv', 'site_uv'] as const;
const PAGE_METRIC_KEYS = ['page_pv'] as const;

type VercountMetricKey = (typeof SITE_METRIC_KEYS)[number] | (typeof PAGE_METRIC_KEYS)[number];
type VercountCounts = Record<VercountMetricKey, number>;
type CachedVercountCounts = { pageUrl: string; counts: VercountCounts };

// 最近一次拿到的计数，供页面组件挂载时立即回填（路由切换时 Ping 通常先于新页面
// span 挂载完成，组件挂载后从缓存补一次即可即时显示，无需再次上报）。
// page_pv（页面级计数）属于当前路由，缓存必须绑定 URL，
// 禁止把上一篇文章的计数填进新文章。
let lastResponse: CachedVercountCounts | null = null;
// 最近一次上报失败的路由：该路由的 span 晚于失败挂载时（文章页懒加载、阅读模式
// 切换重挂）也要显示「—」，而不是永久停在「加载中」。
let failedPageUrl: string | null = null;
// 每次上报递增的令牌：只有最近一次 Ping 的回填轮询可以继续跑。旧轮询必须失效，
// 否则它可能在新页面 span 挂载后把旧计数写进去。
let pingToken = 0;

// 与 siteNav.normalizePathname 同一口径：SSG 产物是 /post/x/，客户端 Link 是
// /post/x，Workers 静态资源还会把无斜杠的文章地址 307 到带斜杠版本。不归一就会把
// 同一篇文章的阅读量拆成两个计数器（接口按 host + path 存 key）。
const normalizePathname = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname;

// 接口按 host + path 计数，这里同样去掉 query / hash：站内带查询参数的导航
// （如 /posts?tag=react）与不带参数的是同一篇文章，缓存也应命中同一份计数。
const getPageUrl = (): string => `${window.location.origin}${normalizePathname(window.location.pathname)}`;

const getSiteUvCookieName = (): string => {
  const host = window.location.host || 'unknown-host';
  // cookie 名只允许安全字符，与官方脚本的清洗规则一致。
  return `${VERCUNT_UV_COOKIE_PREFIX}${host.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
};

const hasSiteUvCookie = (): boolean => {
  const name = `${getSiteUvCookieName()}=`;
  return document.cookie.split('; ').some((entry) => entry.startsWith(name) && entry.slice(name.length) === '1');
};

// 首次访问（或 cookie 已过期）才标记 isNewUv，随后写入一年期 cookie：
// 服务端据此把该浏览器计为这个站点的一个独立访客。
const readAndMarkNewUv = (): boolean => {
  const isNewUv = !hasSiteUvCookie();
  if (isNewUv) {
    document.cookie = `${getSiteUvCookieName()}=1; path=/; max-age=${VERCUNT_UV_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }
  return isNewUv;
};

const toCount = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * 解析计数响应；无法得到可信计数时返回 null（按上报失败处理）。
 *
 * 兼容 v2 的 { status, data }、v1 的裸对象；`status: 'error'`、缺 data、字段不是
 * 数字（如接口对非法 URL 回 { error }）都必须判为失败 —— 否则页面会把 0 当成
 * 真实阅读量显示成「0 次阅读」，还会被写进缓存。
 */
const extractCounts = (payload: unknown): VercountCounts | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.status === 'error') return null;
  const source = (record.data && typeof record.data === 'object' ? record.data : record) as Record<string, unknown>;
  const counts = {
    site_pv: toCount(source.site_pv),
    page_pv: toCount(source.page_pv),
    site_uv: toCount(source.site_uv),
  };
  if (counts.site_pv === null || counts.page_pv === null || counts.site_uv === null) return null;
  return counts as VercountCounts;
};

const getSpan = (key: VercountMetricKey): HTMLElement | null =>
  document.getElementById(`${VERCUNT_SPAN_ID_PREFIX}${key}`);

// 当前路由可回填的 key：站级恒可回填，页面级只在 URL 一致时回填。
const fillableKeys = (pageUrl: string): readonly VercountMetricKey[] =>
  pageUrl === getPageUrl() ? [...SITE_METRIC_KEYS, ...PAGE_METRIC_KEYS] : [...SITE_METRIC_KEYS];

// 回填所有存在且可回填的 span，返回实际填充到的元素数。
const fillCounts = ({ pageUrl, counts }: CachedVercountCounts): number => {
  if (typeof document === 'undefined') return 0;
  let painted = 0;
  for (const key of fillableKeys(pageUrl)) {
    const span = getSpan(key);
    if (!span) continue;
    span.textContent = String(counts[key]);
    painted += 1;
  }
  return painted;
};

// 上报失败（离线 / 接口故障 / 超时 / 响应不可信）时把仍是「加载中」占位文案的 span
// 替换为「—」，避免统计不可用却永久显示「加载中」误导用户。已被真实计数填充的
// span 不覆盖。返回实际改写的元素数。
const markUnavailable = (pageUrl: string): number => {
  if (typeof document === 'undefined') return 0;
  let painted = 0;
  for (const key of fillableKeys(pageUrl)) {
    const span = getSpan(key);
    if (span && span.textContent === VERCUNT_PENDING_TEXT) {
      span.textContent = VERCUNT_UNAVAILABLE_TEXT;
      painted += 1;
    }
  }
  return painted;
};

// 计数位可能晚于 Ping 挂载（路由退出动画结束、文章页懒加载完成、退出阅读模式），
// 因此先同步画一次，没画到再按帧重试到画上为止；受令牌与帧数上限约束，不会空转。
const paintWithRetry = (token: number, paint: () => number): void => {
  if (token !== pingToken) return;
  if (paint() > 0) return;
  let frames = 0;
  const step = () => {
    if (token !== pingToken) return;
    if (paint() === 0 && ++frames < VERCUNT_FILL_RETRY_FRAMES) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/**
 * 用最近一次的结果回填当前页面中的 Vercount span（不发起请求、不计数）。
 * 供展示计数的组件在挂载/可见性变化时调用：成功过就用缓存计数，失败过就把仍是
 * 「加载中」的占位改成「—」，避免 span 晚于 Ping 完成时永久停在加载态。
 */
export const fillVercountSpans = (): void => {
  if (typeof window === 'undefined') return;
  const pageUrl = getPageUrl();
  // 当前路由失败过：优先收尾占位（站级计数即便有旧缓存也不该盖掉「—」的语义）。
  if (failedPageUrl === pageUrl) {
    markUnavailable(pageUrl);
    return;
  }
  if (lastResponse) {
    fillCounts(lastResponse);
  }
};

/**
 * 上报当前页面访问并回填 Vercount 计数 span。
 *
 * 路由切换时**不**中断在飞的请求：一次路由切换本身就是一次真实浏览，让请求完成才能
 * 如实计数；迟到的响应会按 URL 丢弃，不会污染当前页的缓存与占位。
 */
export const pingVercount = (): void => {
  if (typeof window === 'undefined') return;

  const pageUrl = getPageUrl();
  const token = ++pingToken;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VERCUNT_REQUEST_TIMEOUT_MS);

  fetch(VERCUNT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pageUrl, isNewUv: readAndMarkNewUv() }),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Vercount HTTP ${response.status}`);
      return response.json();
    })
    .then((payload: unknown) => {
      const counts = extractCounts(payload);
      // 旧路由的响应晚到时不得写缓存、不得回填：否则新页面计数会停在「加载中」
      // 直到下一次导航，页面级计数还会串到别的文章上。
      if (pageUrl !== getPageUrl()) return;
      if (!counts) throw new Error('Vercount response has no usable counts');
      lastResponse = { pageUrl, counts };
      failedPageUrl = null;
      paintWithRetry(token, () => fillCounts({ pageUrl, counts }));
    })
    .catch(() => {
      // 超时（controller.abort）、离线、非 2xx、响应不可信都按统计故障处理。
      if (pageUrl !== getPageUrl()) return;
      lastResponse = null;
      failedPageUrl = pageUrl;
      paintWithRetry(token, () => markUnavailable(pageUrl));
    })
    .finally(() => window.clearTimeout(timeoutId));
};
