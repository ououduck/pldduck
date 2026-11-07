/**
 * `/api/status` 实现模块（被 `worker/index.mjs` 导入；本身不是 Worker 入口）。
 *
 * 注意：Cloudflare Workers 的 ESM 入口只允许 `export default { fetch }`，入口模块
 * 不能导出常量/普通函数（运行时会报 `Incorrect type for map entry`）。因此本文件
 * 保留全部可测试的具名导出，入口 `index.mjs` 只做一层转发。
 *
 * 职责与边界：
 * - 只代理 Better Stack Status Page API，静态资源仍由 Workers Static Assets 直接服务
 *   （wrangler.jsonc 的 assets.run_worker_first 只把 /api/* 路由进本 Worker）；
 * - Token 只从 Worker Secret（env.BETTERSTACK_API_TOKEN）读取，绝不出现在响应、
 *   日志、缓存键或前端产物中；
 * - 上游请求 5 秒超时且只尝试一次（不重试）；
 * - 严格校验上游状态值：只有 operational/degraded/downtime/maintenance 才算成功，
 *   未知值/缺字段/非法 JSON/非 2xx/超时/网络错误/配置缺失一律回退 unavailable；
 * - 成功结果写入 caches.default 60 秒；失败结果绝不写缓存（避免把故障缓存成 operational）；
 * - 对外响应 Cache-Control: no-store（浏览器/CDN 不缓存），另加 X-Content-Type-Options: nosniff；
 *   不设置 Access-Control-Allow-Origin（不放开跨域）。
 *
 * 失败时仍返回 HTTP 200 + { success: false, status: 'unavailable' }：unavailable 是本接口
 * 契约内的兜底状态（前端据此显示中性「服务状态」），而非 HTTP 层错误；405/404 才用
 * 对应的 HTTP 状态码。
 */

/** 本 Worker 唯一处理的路径（尾部斜杠由 isStatusPath 兼容）。 */
export const STATUS_PATH = '/api/status';

/** 成功结果在 Cache API 中的缓存时长。 */
export const STATUS_CACHE_TTL_SECONDS = 60;

/** 上游请求超时时间（毫秒），超时后 abort，不重试。 */
export const STATUS_UPSTREAM_TIMEOUT_MS = 5000;

/** Better Stack Status Page API 地址（按任务契约固定，不跟随用户输入）。 */
export const BETTERSTACK_STATUS_PAGE_API_ORIGIN = 'https://incidents.betterstack.com';

/** 上游 aggregate_state 的合法取值集合。 */
export const VALID_AGGREGATE_STATES = Object.freeze(['operational', 'degraded', 'downtime', 'maintenance']);

const VALID_AGGREGATE_STATE_SET = new Set(VALID_AGGREGATE_STATES);
const UNAVAILABLE_STATUS = 'unavailable';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const CLIENT_CACHE_CONTROL = 'no-store';
const STORED_CACHE_CONTROL = `public, max-age=${STATUS_CACHE_TTL_SECONDS}`;
/**
 * 存入 Cache API 的响应带内部时间戳：Cache API 的 match 不保证按 max-age 过期，
 * 因此 60 秒 TTL 由本 Worker 在读取时自行判定；该头只存在于缓存副本，不会下发给客户端。
 */
const CACHE_TIMESTAMP_HEADER = 'X-Status-Cached-At';

/**
 * 统一 JSON 响应（对外头：no-store + nosniff，不设置 CORS 头）。
 *
 * @param {unknown} payload 序列化为 JSON 的响应体
 * @param {{ status?: number, headers?: Record<string, string> }} [options]
 * @returns {Response}
 */
const jsonResponse = (payload, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
      'Cache-Control': CLIENT_CACHE_CONTROL,
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });

/**
 * 读取 Worker 配置：Token 与状态页 ID 任一缺失/空白都视为未配置（不请求上游）。
 *
 * @param {Record<string, unknown> | undefined} env
 * @returns {{ token: string, pageId: string } | null}
 */
const readStatusConfig = (env) => {
  const token = typeof env?.BETTERSTACK_API_TOKEN === 'string' ? env.BETTERSTACK_API_TOKEN.trim() : '';
  const pageId = typeof env?.BETTERSTACK_STATUS_PAGE_ID === 'string' ? env.BETTERSTACK_STATUS_PAGE_ID.trim() : '';
  if (!token || !pageId) return null;
  return { token, pageId };
};

/**
 * 获取默认 Cache API；运行环境不可用时返回 null，调用方退化为实时请求。
 *
 * @returns {Cache | null}
 */
const getDefaultCache = () => {
  const cacheStorage = globalThis.caches;
  const defaultCache = cacheStorage?.default;
  if (typeof defaultCache?.match !== 'function' || typeof defaultCache?.put !== 'function') return null;
  return defaultCache;
};

/**
 * 缓存键：与当前请求同源（自定义域 / workers.dev 下都能正常 put/match，避免合成外部域
 * 在部分 Cache API 实现中被拒绝或忽略），路径统一为 API 路径；清空客户端传入的
 * query/hash 后只写入 status_page_id，既不保留任意参数（防缓存碎片化/污染），也不含
 * Token 等敏感信息。
 *
 * @param {Request} request
 * @param {string} pageId
 * @returns {Request}
 */
const buildCacheKey = (request, pageId) => {
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.pathname = STATUS_PATH;
  cacheKeyUrl.search = '';
  cacheKeyUrl.hash = '';
  cacheKeyUrl.searchParams.set('status_page_id', pageId);
  return new Request(cacheKeyUrl.toString());
};

/**
 * 校验缓存中的 payload 形状：坏缓存按未命中处理，绝不能把它当成功状态返回。
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
const isSuccessfulPayload = (payload) =>
  Boolean(payload) &&
  payload.success === true &&
  typeof payload.status === 'string' &&
  VALID_AGGREGATE_STATE_SET.has(payload.status) &&
  typeof payload.updatedAt === 'string';

/**
 * 读取未过期的成功缓存；任何异常/坏数据都按未命中处理。
 *
 * @param {Cache | null} cache
 * @param {Request} cacheKey
 * @returns {Promise<{ success: true, status: string, updatedAt: string } | null>}
 */
const readCachedStatus = async (cache, cacheKey) => {
  if (!cache) return null;
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (!cachedResponse) return null;
    const cachedAt = Number(cachedResponse.headers.get(CACHE_TIMESTAMP_HEADER));
    const isFresh = Number.isFinite(cachedAt) && Date.now() - cachedAt < STATUS_CACHE_TTL_SECONDS * 1000;
    if (!isFresh) return null;
    const cachedPayload = await cachedResponse.json();
    if (!isSuccessfulPayload(cachedPayload)) return null;
    return cachedPayload;
  } catch {
    // Cache API 读取异常按未命中处理：宁可多请求一次上游，也不让缓存故障影响可用性。
    return null;
  }
};

/**
 * 仅成功结果写缓存；写入失败只记录通用告警，不影响本次响应。
 *
 * @param {{ waitUntil?: (promise: Promise<unknown>) => void } | undefined} ctx
 * @param {Request} cacheKey
 * @param {{ success: true, status: string, updatedAt: string }} payload
 */
const writeCachedStatus = (ctx, cacheKey, payload) => {
  const cache = getDefaultCache();
  if (!cache) return;
  const storedResponse = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': JSON_CONTENT_TYPE,
      'Cache-Control': STORED_CACHE_CONTROL,
      [CACHE_TIMESTAMP_HEADER]: String(Date.now()),
    },
  });
  try {
    // cache.put 在部分运行时/异常入参下可能同步抛错（而非返回 rejected promise）；
    // 两种失败都必须兜住：缓存故障绝不能影响本次成功响应。
    const writePromise = Promise.resolve(cache.put(cacheKey, storedResponse)).catch(() => {
      console.warn('[api/status] 写入 Cache API 失败，已忽略（不影响本次响应）');
    });
    if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(writePromise);
  } catch {
    console.warn('[api/status] 写入 Cache API 失败，已忽略（不影响本次响应）');
  }
};

/**
 * 把上游响应转换为对外 payload；严格校验，任何不合格都返回 null。
 *
 * @param {unknown} upstreamPayload
 * @returns {{ success: true, status: string, updatedAt: string } | null}
 */
const toStatusPayload = (upstreamPayload) => {
  const attributes = upstreamPayload?.data?.attributes;
  const aggregateState = attributes?.aggregate_state;
  if (typeof aggregateState !== 'string' || !VALID_AGGREGATE_STATE_SET.has(aggregateState)) return null;
  const rawUpdatedAt = attributes?.updated_at;
  const parsedUpdatedAt = typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) : Number.NaN;
  return {
    success: true,
    status: aggregateState,
    updatedAt: Number.isFinite(parsedUpdatedAt) ? new Date(parsedUpdatedAt).toISOString() : new Date().toISOString(),
  };
};

/**
 * 请求 Better Stack Status Page API：单次请求 + 5 秒超时；失败返回 null。
 * 日志只含通用信息（HTTP 状态码 / 错误类型），不含 Token、Authorization 或上游响应体。
 *
 * @param {{ token: string, pageId: string }} config
 * @returns {Promise<{ success: true, status: string, updatedAt: string } | null>}
 */
const fetchStatusFromUpstream = async ({ token, pageId }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STATUS_UPSTREAM_TIMEOUT_MS);
  try {
    const upstreamUrl = `${BETTERSTACK_STATUS_PAGE_API_ORIGIN}/api/v2/status-pages/${encodeURIComponent(pageId)}`;
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      // Token 只允许发往固定的 Better Stack API：拒绝跟随任何重定向，
      // 避免被 3xx 带到别的源后把 Bearer Token 一起带过去。
      redirect: 'error',
      signal: controller.signal,
    });
    if (!upstreamResponse.ok) {
      console.warn(`[api/status] Better Stack 上游返回非 2xx（HTTP ${upstreamResponse.status}）`);
      return null;
    }
    const responseText = await upstreamResponse.text();
    let upstreamPayload;
    try {
      upstreamPayload = JSON.parse(responseText);
    } catch {
      console.warn('[api/status] Better Stack 上游响应不是合法 JSON');
      return null;
    }
    const statusPayload = toStatusPayload(upstreamPayload);
    if (!statusPayload) {
      console.warn('[api/status] Better Stack 上游状态值缺失或未知，按 unavailable 兜底');
    }
    return statusPayload;
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'UnknownError';
    console.warn(`[api/status] Better Stack 上游请求失败（${reason}）`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * @param {string} pathname
 * @returns {boolean}
 */
const isStatusPath = (pathname) => pathname === STATUS_PATH || pathname === `${STATUS_PATH}/`;

/**
 * /api/status 的请求处理器（导出以便单元测试直接调用，无需 Miniflare）。
 *
 * @param {Request} request
 * @param {Record<string, unknown> | undefined} env Worker 环境变量/Secret
 * @param {{ waitUntil?: (promise: Promise<unknown>) => void } | undefined} ctx
 * @returns {Promise<Response>}
 */
export async function handleRequest(request, env, ctx) {
  const { pathname } = new URL(request.url);
  if (!isStatusPath(pathname)) {
    // 静态资源由 Assets 直接服务（run_worker_first 只匹配 /api/*），这里只兜住其他 API 路径。
    return jsonResponse({ success: false, error: 'not_found' }, { status: 404 });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ success: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  const config = readStatusConfig(env);
  if (!config) {
    console.warn('[api/status] BETTERSTACK_API_TOKEN 或 BETTERSTACK_STATUS_PAGE_ID 未配置，返回 unavailable');
    return jsonResponse({ success: false, status: UNAVAILABLE_STATUS }, { headers: { 'X-Status-Cache': 'MISS' } });
  }

  const cacheKey = buildCacheKey(request, config.pageId);
  const cachedPayload = await readCachedStatus(getDefaultCache(), cacheKey);
  if (cachedPayload) {
    return jsonResponse(cachedPayload, { headers: { 'X-Status-Cache': 'HIT' } });
  }

  const freshPayload = await fetchStatusFromUpstream(config);
  if (!freshPayload) {
    return jsonResponse({ success: false, status: UNAVAILABLE_STATUS }, { headers: { 'X-Status-Cache': 'MISS' } });
  }

  writeCachedStatus(ctx, cacheKey, freshPayload);
  return jsonResponse(freshPayload, { headers: { 'X-Status-Cache': 'MISS' } });
}
