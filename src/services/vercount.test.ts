import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import type * as VercountModule from './vercount';

// 服务层持有模块级状态（lastResponse / failedPageUrl / pingToken），用例之间必须
// 重新 import 才互不影响（见 ai-rules/testing.md 的模块级缓存约定）。
let vercount: typeof VercountModule;
const PENDING = '加载中';

const makeSpan = (id: string, text = '') => {
  const span = document.createElement('span');
  span.id = id;
  span.textContent = text;
  document.body.appendChild(span);
  return span;
};

const mockFetchSuccess = (data: { site_pv: number; page_pv: number; site_uv: number }) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: 'success', message: 'Data updated successfully', data }),
  });

// 永不自行完成的 fetch：只在收到 abort 时以 AbortError 失败，用于超时用例。
const mockFetchHanging = () =>
  vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );

const readRequestBody = (fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) =>
  JSON.parse(fetchMock.mock.calls[callIndex][1].body as string) as {
    url: string;
    isNewUv: boolean;
  };

const flushAnimationFrames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));

const clearCookies = () => {
  for (const entry of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${entry.split('=')[0]}=; path=/; max-age=0`;
  }
};

// 旧模块实例（上一个用例）启动的 rAF 回填轮询只能靠「画到东西」结束，否则会跨用例
// 把旧计数写进本用例新建的 span。给它们一对临时 span 收尾后再移除。
const drainStaleFillLoops = async () => {
  const probes = ['page_pv', 'site_pv'].map((key) => {
    const span = makeSpan(`vercount_value_${key}`, PENDING);
    return span;
  });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  probes.forEach((span) => span.remove());
};

describe('vercount 统计', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vercount = await import('./vercount');
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    clearCookies();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await drainStaleFillLoops();
  });

  it('上报当前页并按 vercount_value_* 回填页面级计数', async () => {
    const siteSpan = makeSpan('vercount_value_site_pv');
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    const fetchMock = mockFetchSuccess({ site_pv: 1234, page_pv: 56, site_uv: 78 });
    vi.stubGlobal('fetch', fetchMock);

    vercount.pingVercount();
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('56');
    });
    expect(siteSpan.textContent).toBe('1234');

    // 协议必须与官方脚本/客户端一致：POST 到 v2 log 接口，JSON 里带 url 与 isNewUv。
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://events.vercount.one/api/v2/log');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(readRequestBody(fetchMock)).toEqual({ url: 'http://localhost:3000/', isNewUv: true });
  });

  it('尾斜杠归一：/post/x 与 /post/x/ 用同一计数 key，带查询参数也命中', async () => {
    // Workers 会把无斜杠的文章地址 307 到带斜杠版本，而站内 Link/canonical 是无斜杠的。
    window.history.replaceState({}, '', '/post/x/');
    const fetchMock = mockFetchSuccess({ site_pv: 10, page_pv: 3, site_uv: 4 });
    vi.stubGlobal('fetch', fetchMock);

    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(readRequestBody(fetchMock).url).toBe('http://localhost:3000/post/x');

    window.history.replaceState({}, '', '/post/x');
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    vercount.fillVercountSpans();
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('3');
    });

    // ?utm_source=... 之类的查询参数不改变页面身份。
    window.history.replaceState({}, '', '/post/x?utm_source=test');
    pageSpan.remove();
    const querySpan = makeSpan('vercount_value_page_pv', PENDING);
    vercount.fillVercountSpans();
    await waitFor(() => {
      expect(querySpan.textContent).toBe('3');
    });
  });

  it('首次访问标记 isNewUv 并写入一年期 cookie，再次上报复用同一访客', async () => {
    const fetchMock = mockFetchSuccess({ site_pv: 1, page_pv: 1, site_uv: 1 });
    vi.stubGlobal('fetch', fetchMock);

    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(readRequestBody(fetchMock, 0).isNewUv).toBe(true);
    expect(document.cookie).toContain('vercount_uv_');

    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(readRequestBody(fetchMock, 1).isNewUv).toBe(false);
  });

  it('fetch 失败时静默（不抛错）', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(() => vercount.pingVercount()).not.toThrow();
  });

  it('fetch 失败时把「加载中」占位替换为「—」，已填充的不覆盖', async () => {
    const pendingSpan = makeSpan('vercount_value_page_pv', PENDING);
    const filledSpan = makeSpan('vercount_value_site_pv', '1234');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    vercount.pingVercount();
    await waitFor(() => {
      expect(pendingSpan.textContent).toBe('—');
    });
    expect(filledSpan.textContent).toBe('1234');
  });

  it('HTTP 非 2xx 时同样降级为「—」', async () => {
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({}) }));

    vercount.pingVercount();
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('—');
    });
  });

  it('200 + status:error 不显示成「0 次阅读」，降级为「—」且不写缓存', async () => {
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'error', message: 'Invalid URL format', code: 200, data: {} }),
      }),
    );

    vercount.pingVercount();
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('—');
    });

    // 失败结果不得进缓存：新挂载的 span 也只是「—」，不会突然出现 0。
    pageSpan.remove();
    const lateSpan = makeSpan('vercount_value_page_pv', PENDING);
    vercount.fillVercountSpans();
    expect(lateSpan.textContent).toBe('—');
  });

  it('超时（5s）后降级为「—」，不会永久停在加载中', async () => {
    vi.useFakeTimers();
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    vi.stubGlobal('fetch', mockFetchHanging());

    vercount.pingVercount();
    await vi.advanceTimersByTimeAsync(4999);
    expect(pageSpan.textContent).toBe(PENDING);

    await vi.advanceTimersByTimeAsync(1);
    // abort → fetch reject → catch 属于微任务链，再多冲刷一轮。
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(pageSpan.textContent).toBe('—');
  });

  it('fillVercountSpans 用最近一次缓存回填新挂载的 span', async () => {
    // 先上报一次写入模块级缓存（lastResponse），再挂载「迟到」的 span：
    // fillVercountSpans 应从缓存回填，而非依赖 fetch。
    vi.stubGlobal('fetch', mockFetchSuccess({ site_pv: 999, page_pv: 7, site_uv: 12 }));
    vercount.pingVercount();
    await flushAnimationFrames();

    const lateSpan = makeSpan('vercount_value_site_pv');
    vercount.fillVercountSpans();
    await waitFor(() => {
      expect(lateSpan.textContent).toBe('999');
    });
  });

  it('失败后迟挂载的 span 也补画「—」（文章页懒加载 / 阅读模式重挂）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    vercount.pingVercount();
    // 等待失败状态落定：此时页面上还没有任何计数 span。
    await flushAnimationFrames();

    const lateSpan = makeSpan('vercount_value_page_pv', PENDING);
    vercount.fillVercountSpans();
    expect(lateSpan.textContent).toBe('—');
  });

  it('页面级计数不串页：缓存 URL 与当前路由不一致时只回填站级计数', async () => {
    vi.stubGlobal('fetch', mockFetchSuccess({ site_pv: 100, page_pv: 42, site_uv: 9 }));
    vercount.pingVercount();
    await flushAnimationFrames();

    // 客户端导航到另一篇文章：页面级计数属于旧路由，不得填进新文章。
    window.history.replaceState({}, '', '/post/another');
    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    const siteSpan = makeSpan('vercount_value_site_pv');
    vercount.fillVercountSpans();

    await waitFor(() => {
      expect(siteSpan.textContent).toBe('100');
    });
    expect(pageSpan.textContent).toBe(PENDING);
  });

  it('旧路由响应迟到时丢弃，不覆盖新路由的计数', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', data: { site_pv: 2, page_pv: 2, site_uv: 2 } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    // 文章 A 的请求在飞，用户立刻切到文章 B。
    vercount.pingVercount();
    window.history.replaceState({}, '', '/post/b');
    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // A 的响应此时才回来：不得写缓存（否则 B 会显示 A 的计数）。
    resolveFirst?.({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'success', data: { site_pv: 1, page_pv: 1, site_uv: 1 } }),
    });
    await flushAnimationFrames();

    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    vercount.fillVercountSpans();
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('2');
    });
  });

  it('旧路由的回填轮询失效，不会把旧计数写进新页面', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', data: { site_pv: 1, page_pv: 111, site_uv: 1 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'success', data: { site_pv: 1, page_pv: 222, site_uv: 1 } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    // 第一次上报时页面上没有 span，回填轮询会持续若干帧。
    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // 第二次上报（新路由）接手，旧轮询必须失效。
    window.history.replaceState({}, '', '/post/newer');
    vercount.pingVercount();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const pageSpan = makeSpan('vercount_value_page_pv', PENDING);
    await waitFor(() => {
      expect(pageSpan.textContent).toBe('222');
    });
  });
});
