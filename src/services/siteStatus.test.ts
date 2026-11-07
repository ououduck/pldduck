import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSiteStatus, resolveStatusPageUrl, STATUS_REQUEST_TIMEOUT_MS, type SiteStatusLiveValue } from './siteStatus';

// 站点配置用可变 mock：用例可临时把 statusPageUrl 改坏，验证回退链。
const siteConfigMock = vi.hoisted(() => ({
  statusPageUrl: 'https://status.pldduck.com' as string | undefined,
}));

vi.mock('@config/site.config', () => ({ siteConfig: siteConfigMock }));

type FetchMock = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

const createFetchMock = (): FetchMock => vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

/** 构造最小 Response 替身：服务只读 ok/status/json。 */
const jsonResponse = (body: unknown, options: { ok?: boolean; status?: number } = {}): Response =>
  ({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
  }) as unknown as Response;

const LIVE_STATUSES: SiteStatusLiveValue[] = ['operational', 'degraded', 'downtime', 'maintenance'];

beforeEach(() => {
  siteConfigMock.statusPageUrl = 'https://status.pldduck.com';
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('resolveStatusPageUrl', () => {
  it('默认使用 siteConfig.statusPageUrl', () => {
    expect(resolveStatusPageUrl()).toBe('https://status.pldduck.com');
  });

  it('VITE_BETTERSTACK_STATUS_PAGE_URL 优先于站点配置（构建期覆盖入口）', () => {
    siteConfigMock.statusPageUrl = 'https://status.config.example.com';
    vi.stubEnv('VITE_BETTERSTACK_STATUS_PAGE_URL', 'https://status.env.example.com/');
    expect(resolveStatusPageUrl()).toBe('https://status.env.example.com/');
  });

  it('环境变量非 https（http / javascript: / 无协议 / 空串）时忽略，回退站点配置', () => {
    for (const value of ['http://status.example.com', 'javascript:alert(1)', 'status.example.com', '']) {
      vi.stubEnv('VITE_BETTERSTACK_STATUS_PAGE_URL', value);
      expect(resolveStatusPageUrl(), value).toBe('https://status.pldduck.com');
    }
  });

  it('站点配置也非法时回退到按站点域名约定的默认值', () => {
    siteConfigMock.statusPageUrl = 'http://status.pldduck.com';
    expect(resolveStatusPageUrl()).toBe('https://status.pldduck.com');

    siteConfigMock.statusPageUrl = undefined;
    expect(resolveStatusPageUrl()).toBe('https://status.pldduck.com');

    siteConfigMock.statusPageUrl = 'ftp://status.pldduck.com';
    expect(resolveStatusPageUrl()).toBe('https://status.pldduck.com');
  });

  it('配置值首尾空白会被裁剪', () => {
    siteConfigMock.statusPageUrl = '  https://status.pldduck.com  ';
    expect(resolveStatusPageUrl()).toBe('https://status.pldduck.com');
  });
});

describe('getSiteStatus — 成功解析四态', () => {
  it.each(LIVE_STATUSES)('状态 %s 正常返回，请求参数符合契约', async (status) => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, status, updatedAt: '2026-11-07T08:00:00.000Z' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({
      status,
      updatedAt: '2026-11-07T08:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/status');
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('上游未给 updatedAt 时只返回状态', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, status: 'operational' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'operational' });
  });

  it('updatedAt 不是字符串时忽略该字段（不污染渲染）', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, status: 'degraded', updatedAt: 123 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'degraded' });
  });
});

describe('getSiteStatus — 任何失败都回退 unavailable 且不抛错', () => {
  it.each([
    ['未知状态值', { success: true, status: 'exploded' }],
    ['success 不为 true', { success: false, status: 'operational' }],
    ['缺少 status 字段', { success: true }],
    ['payload 是数组', ['operational']],
    ['payload 是 null', null],
  ])('%s → unavailable', async (_name, payload) => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [500, '上游 500'],
    [429, '限流 429'],
    [1027, '平台拦截 1027'],
    [403, '禁止访问 403'],
  ])('HTTP %s（%s）→ unavailable 且不解析响应体', async (status) => {
    const json = vi.fn(async () => ({ success: true, status: 'operational' }));
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({ ok: false, status, json } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'unavailable' });
    expect(json).not.toHaveBeenCalled();
  });

  it('响应体不是 JSON（HTML 错误页 / 空响应）→ unavailable', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'unavailable' });
  });

  it('网络错误（fetch reject）→ unavailable', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getSiteStatus()).resolves.toEqual({ status: 'unavailable' });
  });

  it('8s 超时后中止请求并兜底（AbortController）', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = createFetchMock();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = getSiteStatus();
    await vi.advanceTimersByTimeAsync(STATUS_REQUEST_TIMEOUT_MS - 1);
    expect(aborted, '未到 8s 不应中止').toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(request).resolves.toEqual({ status: 'unavailable' });
    expect(aborted).toBe(true);
  });
});

describe('getSiteStatus — 并发去重与取消', () => {
  it('并发调用只发一个请求（桌面侧栏与移动抽屉同时挂载）', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, status: 'degraded' }));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([getSiteStatus(), getSiteStatus()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ status: 'degraded' });
    expect(second).toEqual({ status: 'degraded' });
  });

  it('请求结束后清空 in-flight：下一轮轮询重新请求（不吃旧缓存）', async () => {
    const fetchMock = createFetchMock();
    fetchMock.mockResolvedValue(jsonResponse({ success: true, status: 'maintenance' }));
    vi.stubGlobal('fetch', fetchMock);

    await getSiteStatus();
    await getSiteStatus();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('消费者 abort 只取消自己的等待，共享请求仍为另一个挂载点完成', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = createFetchMock();
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const cancelled = getSiteStatus(controller.signal);
    controller.abort();
    await expect(cancelled).resolves.toEqual({ status: 'unavailable' });

    // 共享请求还没结束：另一个消费者挂到同一条在途请求上。
    const shared = getSiteStatus();
    resolveFetch?.(jsonResponse({ success: true, status: 'operational' }));
    await expect(shared).resolves.toEqual({ status: 'operational' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('已 abort 的 signal 直接按兜底结算，不发起请求', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    controller.abort();
    await expect(getSiteStatus(controller.signal)).resolves.toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
