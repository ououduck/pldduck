// @vitest-environment node
/**
 * /api/status Worker 单元测试（node 环境，无需 Miniflare）。
 *
 * 用 vi.stubGlobal 模拟 fetch 与 caches.default；Cache 用一个最小内存实现，
 * 覆盖成功四态、严格校验兜底、超时/网络错误、配置缺失、路由与方法、缓存命中/TTL/失败不缓存、
 * 以及 Token 不泄露等安全断言。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index.mjs';
import { STATUS_CACHE_TTL_SECONDS, STATUS_PATH, STATUS_UPSTREAM_TIMEOUT_MS, handleRequest } from './status.mjs';

const SITE_ORIGIN = 'https://www.pldduck.com';
const TOKEN = 'test-betterstack-token-must-never-leak';
const PAGE_ID = 'status-page-123';

/** 最小内存 Cache 实现：按 Request.url 存取，返回 clone 避免 body 被消费。 */
class MemoryCache {
  constructor() {
    /** @type {Map<string, Response>} */
    this.entries = new Map();
  }

  /** @param {Request | string} request */
  static keyOf(request) {
    return typeof request === 'string' ? request : request.url;
  }

  /** @param {Request | string} request */
  async match(request) {
    const stored = this.entries.get(MemoryCache.keyOf(request));
    return stored ? stored.clone() : undefined;
  }

  /**
   * @param {Request | string} request
   * @param {Response} response
   */
  async put(request, response) {
    this.entries.set(MemoryCache.keyOf(request), response.clone());
  }
}

/** Better Stack Status Page API 响应形状（只保留契约用到的字段）。 */
const betterStackPayload = (aggregateState, updatedAt = '2026-11-06T12:34:56.000Z') => ({
  data: {
    id: PAGE_ID,
    type: 'status_page',
    attributes: {
      aggregate_state: aggregateState,
      updated_at: updatedAt,
    },
  },
});

/** @param {unknown} payload */
const upstreamJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** @param {string} path */
const createRequest = (path = STATUS_PATH, init = {}) => new Request(`${SITE_ORIGIN}${path}`, init);

/** @param {Record<string, unknown>} overrides */
const createEnv = (overrides = {}) => ({
  BETTERSTACK_API_TOKEN: TOKEN,
  BETTERSTACK_STATUS_PAGE_ID: PAGE_ID,
  ...overrides,
});

/** 提供 waitUntil 收集器：缓存写入是后台任务，需要 await 后才可断言。 */
const createContext = () => {
  /** @type {Promise<unknown>[]} */
  const pending = [];
  const waitUntil = vi.fn((promise) => {
    pending.push(promise);
  });
  return {
    ctx: { waitUntil },
    waitUntil,
    flush: () => Promise.all(pending.splice(0)),
  };
};

/** 断言兜底响应：HTTP 200 + success:false/unavailable + 安全响应头。 */
const expectUnavailableResponse = async (response) => {
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  expect(response.headers.get('X-Status-Cache')).toBe('MISS');
  await expect(response.json()).resolves.toEqual({ success: false, status: 'unavailable' });
};

describe('/api/status', () => {
  /** @type {MemoryCache} */
  let cache;
  /** @type {import('vitest').MockInstance} */
  let warnSpy;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.stubGlobal('caches', { default: cache });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('成功路径', () => {
    it.each(['operational', 'degraded', 'downtime', 'maintenance'])(
      '上游 %s 状态原样透传，并只回源一次',
      async (aggregateState) => {
        const fetchMock = vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload(aggregateState)));
        vi.stubGlobal('fetch', fetchMock);
        const { ctx, flush, waitUntil } = createContext();

        const response = await handleRequest(createRequest(), createEnv(), ctx);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
          success: true,
          status: aggregateState,
          updatedAt: '2026-11-06T12:34:56.000Z',
        });
        expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(response.headers.get('X-Status-Cache')).toBe('MISS');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [upstreamUrl, upstreamInit] = fetchMock.mock.calls[0];
        expect(upstreamUrl).toBe(`https://incidents.betterstack.com/api/v2/status-pages/${PAGE_ID}`);
        expect(upstreamInit.method).toBe('GET');
        expect(upstreamInit.headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(upstreamInit.headers.Accept).toBe('application/json');
        expect(upstreamInit.signal).toBeInstanceOf(AbortSignal);
        // Workers 不支持 redirect: 'error'（构造即抛 TypeError），必须用 manual。
        expect(upstreamInit.redirect).toBe('manual');

        // 成功结果通过 ctx.waitUntil 写入缓存，缓存副本带 public max-age=60 与内部时间戳。
        expect(waitUntil).toHaveBeenCalledTimes(1);
        await flush();
        expect(cache.entries.size).toBe(1);
        const [cacheKey] = [...cache.entries.keys()];
        expect(cacheKey).toContain(STATUS_PATH);
        expect(cacheKey).toContain(PAGE_ID);
        expect(cacheKey).not.toContain(TOKEN);
        const storedResponse = await cache.match(cacheKey);
        expect(storedResponse?.headers.get('Cache-Control')).toBe(`public, max-age=${STATUS_CACHE_TTL_SECONDS}`);
        expect(Number(storedResponse?.headers.get('X-Status-Cached-At'))).toBeGreaterThan(0);
        expect(warnSpy).not.toHaveBeenCalled();
      },
    );

    it('接受带尾部斜杠的 /api/status/', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational'))));
      const response = await handleRequest(createRequest(`${STATUS_PATH}/`), createEnv(), createContext().ctx);
      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'operational' });
    });

    it('updated_at 非法时回退到当前时间（ISO 字符串）', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-07T09:00:00.000Z'));
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational', 'not-a-date'))),
      );

      const response = await handleRequest(createRequest(), createEnv(), createContext().ctx);
      await expect(response.json()).resolves.toEqual({
        success: true,
        status: 'operational',
        updatedAt: '2026-11-07T09:00:00.000Z',
      });
    });

    it('默认导出 fetch 委托给 handleRequest', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('maintenance'))));
      const response = await worker.fetch(createRequest(), createEnv(), createContext().ctx);
      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'maintenance' });
    });
  });

  describe('缓存语义', () => {
    it('命中未过期缓存时直接返回 HIT，且不再请求上游（上游已失败也不影响）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('operational')))
        .mockRejectedValueOnce(new TypeError('fetch failed'));
      vi.stubGlobal('fetch', fetchMock);

      const firstContext = createContext();
      await handleRequest(createRequest(), createEnv(), firstContext.ctx);
      await firstContext.flush();

      const secondContext = createContext();
      const cachedResponse = await handleRequest(createRequest(), createEnv(), secondContext.ctx);
      const cachedBody = await cachedResponse.json();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cachedBody).toEqual({
        success: true,
        status: 'operational',
        updatedAt: '2026-11-06T12:34:56.000Z',
      });
      expect(cachedResponse.headers.get('X-Status-Cache')).toBe('HIT');
      expect(cachedResponse.headers.get('Cache-Control')).toBe('no-store');
      expect(secondContext.waitUntil).not.toHaveBeenCalled();
    });

    it(`超过 ${STATUS_CACHE_TTL_SECONDS} 秒后缓存视为过期并重新回源`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-07T08:00:00.000Z'));
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('operational')))
        .mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('degraded')));
      vi.stubGlobal('fetch', fetchMock);

      const firstContext = createContext();
      await handleRequest(createRequest(), createEnv(), firstContext.ctx);
      await firstContext.flush();

      vi.setSystemTime(new Date(Date.now() + STATUS_CACHE_TTL_SECONDS * 1000 + 1));
      const secondContext = createContext();
      const response = await handleRequest(createRequest(), createEnv(), secondContext.ctx);

      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'degraded' });
      expect(response.headers.get('X-Status-Cache')).toBe('MISS');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('状态页 ID 变化时缓存键不同（不复用别的状态页结果）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('operational')))
        .mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('downtime')));
      vi.stubGlobal('fetch', fetchMock);

      const firstContext = createContext();
      await handleRequest(createRequest(), createEnv(), firstContext.ctx);
      await firstContext.flush();

      const secondContext = createContext();
      const response = await handleRequest(
        createRequest(),
        createEnv({ BETTERSTACK_STATUS_PAGE_ID: 'another-id' }),
        secondContext.ctx,
      );

      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'downtime' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect([...cache.entries.keys()].some((key) => key.includes(PAGE_ID))).toBe(true);
      expect([...cache.entries.keys()].some((key) => key.includes('another-id'))).toBe(true);
    });

    it('缓存键与请求同源，清空客户端任意 query 后只保留 status_page_id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational'))));
      const { ctx, flush } = createContext();
      const request = new Request(`${SITE_ORIGIN}${STATUS_PATH}?foo=bar&status_page_id=forged#fragment`, {
        method: 'GET',
      });

      await handleRequest(request, createEnv(), ctx);
      await flush();

      const [cacheKey] = [...cache.entries.keys()];
      const parsedCacheKey = new URL(cacheKey);
      expect(parsedCacheKey.origin).toBe(SITE_ORIGIN);
      expect(parsedCacheKey.pathname).toBe(STATUS_PATH);
      expect(parsedCacheKey.searchParams.get('status_page_id')).toBe(PAGE_ID);
      expect(parsedCacheKey.searchParams.has('foo')).toBe(false);
      expect(parsedCacheKey.hash).toBe('');
    });

    it('尾部斜杠与无斜杠共享同一缓存键（第二次命中缓存）', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(upstreamJsonResponse(betterStackPayload('operational')));
      vi.stubGlobal('fetch', fetchMock);

      const firstContext = createContext();
      await handleRequest(createRequest(), createEnv(), firstContext.ctx);
      await firstContext.flush();

      const secondContext = createContext();
      const response = await handleRequest(createRequest(`${STATUS_PATH}/`), createEnv(), secondContext.ctx);

      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'operational' });
      expect(response.headers.get('X-Status-Cache')).toBe('HIT');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('缓存写入失败不影响本次成功响应', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational'))));
      cache.put = vi.fn().mockRejectedValue(new Error('cache unavailable'));
      const { ctx, flush } = createContext();

      const response = await handleRequest(createRequest(), createEnv(), ctx);
      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'operational' });
      await flush();
      expect(warnSpy.mock.calls.flat().join(' ')).toContain('Cache API');
    });

    it('cache.put 同步抛错时仍返回成功响应（缓存故障不影响本次响应）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational'))));
      cache.put = vi.fn(() => {
        throw new Error('synchronous cache failure');
      });
      const { ctx, flush } = createContext();

      const response = await handleRequest(createRequest(), createEnv(), ctx);

      await expect(response.json()).resolves.toMatchObject({ success: true, status: 'operational' });
      await flush();
      expect(warnSpy.mock.calls.flat().join(' ')).toContain('Cache API');
    });
  });

  describe('严格校验与兜底', () => {
    it('未知 aggregate_state 回退 unavailable 且不写缓存', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('unknown'))));
      const { ctx, flush } = createContext();

      const response = await handleRequest(createRequest(), createEnv(), ctx);
      await expectUnavailableResponse(response);
      await flush();
      expect(cache.entries.size).toBe(0);
    });

    it('缺少 data.attributes.aggregate_state 回退 unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse({ data: { attributes: {} } })));
      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), createContext().ctx));
      expect(cache.entries.size).toBe(0);
    });

    it('上游 HTTP 500 回退 unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream error', { status: 500 })));
      const { ctx, flush } = createContext();

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), ctx));
      await flush();
      expect(cache.entries.size).toBe(0);
      expect(fetchMockCount()).toBe(1);
    });

    it('上游 HTTP 429 回退 unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
      const { ctx, flush } = createContext();

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), ctx));
      await flush();
      expect(cache.entries.size).toBe(0);
    });

    it('上游 3xx 不跟随重定向并回退 unavailable（redirect manual）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://evil.example/steal' } }));
      vi.stubGlobal('fetch', fetchMock);
      const { ctx, flush } = createContext();

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), ctx));
      await flush();
      expect(cache.entries.size).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
    });

    it('上游返回非 JSON 回退 unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 200 })));
      const { ctx, flush } = createContext();

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), ctx));
      await flush();
      expect(cache.entries.size).toBe(0);
    });

    it('上游网络错误回退 unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
      const { ctx, flush } = createContext();

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(), ctx));
      await flush();
      expect(cache.entries.size).toBe(0);
      expect(fetchMockCount()).toBe(1);
    });

    it('上游 5 秒无响应时 abort 并回退 unavailable（不重试）', async () => {
      vi.useFakeTimers();
      /** @type {AbortSignal | undefined} */
      let upstreamSignal;
      const fetchMock = vi.fn((_url, init) => {
        upstreamSignal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted.');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { ctx, flush } = createContext();

      const pendingResponse = handleRequest(createRequest(), createEnv(), ctx);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(STATUS_UPSTREAM_TIMEOUT_MS);
      const response = await pendingResponse;

      expect(upstreamSignal?.aborted).toBe(true);
      await expectUnavailableResponse(response);
      await flush();
      expect(cache.entries.size).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('失败结果不写缓存：连续两次失败都会重新回源', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      vi.stubGlobal('fetch', fetchMock);

      const firstContext = createContext();
      await handleRequest(createRequest(), createEnv(), firstContext.ctx);
      await firstContext.flush();
      const secondContext = createContext();
      await handleRequest(createRequest(), createEnv(), secondContext.ctx);
      await secondContext.flush();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(cache.entries.size).toBe(0);
    });
  });

  describe('配置与路由', () => {
    it.each([
      ['missing token', { BETTERSTACK_API_TOKEN: undefined }],
      ['missing status page id', { BETTERSTACK_STATUS_PAGE_ID: undefined }],
      ['blank token', { BETTERSTACK_API_TOKEN: '   ' }],
      ['blank status page id', { BETTERSTACK_STATUS_PAGE_ID: '' }],
    ])('%s 时不请求上游并回退 unavailable', async (_label, overrides) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expectUnavailableResponse(await handleRequest(createRequest(), createEnv(overrides), createContext().ctx));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cache.entries.size).toBe(0);
      expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(TOKEN);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])(
      '非 GET 方法 %s 返回 405 + Allow: GET',
      async (method) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const response = await handleRequest(createRequest(STATUS_PATH, { method }), createEnv(), createContext().ctx);

        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
        expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['/api/other', 404],
      ['/api', 404],
      [`${STATUS_PATH}/extra`, 404],
      ['/not-api', 404],
    ])('其他路径 %s 返回 JSON %i', async (path, expectedStatus) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const response = await handleRequest(createRequest(path), createEnv(), createContext().ctx);

      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      await expect(response.json()).resolves.toMatchObject({ success: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Token 不泄露', () => {
    it('成功响应的响应体、响应头与缓存键都不含 Token', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstreamJsonResponse(betterStackPayload('operational'))));
      const { ctx, flush } = createContext();

      const response = await handleRequest(createRequest(), createEnv(), ctx);
      const responseBody = await response.text();
      /** @type {string[]} */
      const headerValues = [];
      response.headers.forEach((value) => headerValues.push(value));
      await flush();

      const serializedHeaders = headerValues.join(' ');
      expect(responseBody).not.toContain(TOKEN);
      expect(serializedHeaders).not.toContain(TOKEN);
      expect([...cache.entries.keys()].join(' ')).not.toContain(TOKEN);
      expect(warnSpy.mock.calls.flat().join(' ')).not.toContain(TOKEN);
    });

    it('失败日志只含通用信息，不含 Token / Authorization / 上游响应体', async () => {
      const upstreamSecretBody = 'sensitive upstream body';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(upstreamSecretBody, { status: 503 })));
      const { ctx, flush } = createContext();

      await handleRequest(createRequest(), createEnv(), ctx);
      await flush();

      const loggedText = warnSpy.mock.calls.flat().join(' ');
      expect(loggedText).not.toContain(TOKEN);
      expect(loggedText).not.toContain('Authorization');
      expect(loggedText).not.toContain(upstreamSecretBody);
    });
  });

  /** @returns {number} 当前 fetch mock 的调用次数（用于多个用例内联断言） */
  function fetchMockCount() {
    const fetchMock = /** @type {import('vitest').Mock} */ (globalThis.fetch);
    return fetchMock.mock.calls.length;
  }
});
