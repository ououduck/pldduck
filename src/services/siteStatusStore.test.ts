import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STATUS_REFRESH_INTERVAL_MS, type SiteStatusResult } from './siteStatus';

// store 复用 siteStatus 的 getSiteStatus()：mock 服务层即可完全控制刷新结果，
// 同时验证「全局只有一条轮询、同一时刻只有一个请求」。
const getSiteStatusMock = vi.hoisted(() => vi.fn<() => Promise<SiteStatusResult>>());

vi.mock('./siteStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./siteStatus')>();
  return { ...actual, getSiteStatus: getSiteStatusMock };
});

type StoreModule = typeof import('./siteStatusStore');

/** 模块级状态（订阅者/轮询/快照）会跨用例残留：每个用例拿全新模块实例。 */
const loadStore = async (): Promise<StoreModule> => {
  vi.resetModules();
  return import('./siteStatusStore');
};

/** 把 refresh() 里的 await 微任务跑干净（fake timers 下即推进 0ms）。 */
const flushAsync = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

const START_TIME = new Date('2026-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START_TIME));
  sessionStorage.clear();
  getSiteStatusMock.mockReset();
  getSiteStatusMock.mockResolvedValue({ status: 'unavailable' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('siteStatusStore — 启动与轮询', () => {
  it('仅导入模块不发起请求、不启动轮询（SSR 安全，等订阅才启动）', async () => {
    await loadStore();
    expect(getSiteStatusMock).not.toHaveBeenCalled();
  });

  it('订阅者立即收到中性快照，随后刷新为最新状态', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'operational' });
    const { subscribeSiteStatus } = await loadStore();
    const listener = vi.fn();

    const unsubscribe = subscribeSiteStatus(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ status: 'unavailable' });

    await flushAsync();
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({ status: 'operational' });

    unsubscribe();
  });

  it('轮询后的新订阅者立即拿到当前结果快照（不额外发请求）', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'degraded' });
    const { subscribeSiteStatus } = await loadStore();
    const first = vi.fn();
    const unsubscribeFirst = subscribeSiteStatus(first);
    await flushAsync();

    const second = vi.fn();
    const unsubscribeSecond = subscribeSiteStatus(second);

    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith({ status: 'degraded' });
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it('状态入口与 Workers 提示共享同一个全局轮询：同一时刻只有一个请求', async () => {
    const { subscribeSiteStatus, subscribeWorkersLimit } = await loadStore();
    const statusListener = vi.fn();
    const workersListener = vi.fn();

    const unsubscribeStatus = subscribeSiteStatus(statusListener);
    const unsubscribeWorkers = subscribeWorkersLimit(workersListener);

    await flushAsync();
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);
    // 第二个订阅者不额外起 timer：60s 后只有一次新请求。
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);

    unsubscribeStatus();
    unsubscribeWorkers();
  });

  it('每 60 秒刷新一次（与 Worker 缓存对齐）', async () => {
    const { subscribeSiteStatus } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeSiteStatus(listener);

    await flushAsync();
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS - 1);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it('页面重新可见时立即补刷，不等下一拍轮询', async () => {
    const { subscribeSiteStatus } = await loadStore();
    const unsubscribe = subscribeSiteStatus(vi.fn());
    await flushAsync();
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsync();

    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('每次轮询都重新请求，不缓存上一轮结果', async () => {
    getSiteStatusMock.mockResolvedValueOnce({ status: 'operational' }).mockResolvedValueOnce({ status: 'downtime' });
    const { subscribeSiteStatus } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeSiteStatus(listener);

    await flushAsync();
    expect(listener).toHaveBeenLastCalledWith({ status: 'operational' });

    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(listener).toHaveBeenLastCalledWith({ status: 'downtime' });

    unsubscribe();
  });

  it('getSiteStatus 意外 reject 时按中性值兜底（契约外防御）', async () => {
    getSiteStatusMock.mockRejectedValue(new Error('unexpected'));
    const { subscribeSiteStatus } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeSiteStatus(listener);

    await flushAsync();
    expect(listener).toHaveBeenLastCalledWith({ status: 'unavailable' });

    unsubscribe();
  });
});

describe('siteStatusStore — 清理', () => {
  it('最后一个订阅者取消后清理轮询与可见性监听，不再请求', async () => {
    const { subscribeSiteStatus } = await loadStore();
    const unsubscribe = subscribeSiteStatus(vi.fn());
    await flushAsync();
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    unsubscribe();

    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsync();

    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('仍有订阅者时取消其中一个不会停掉轮询', async () => {
    const { subscribeSiteStatus, subscribeWorkersLimit } = await loadStore();
    const unsubscribeStatus = subscribeSiteStatus(vi.fn());
    const unsubscribeWorkers = subscribeWorkersLimit(vi.fn());
    await flushAsync();

    unsubscribeWorkers();
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);

    unsubscribeStatus();
  });

  it('全部取消后迟到的结果被丢弃；新订阅者从兜底快照重新开始', async () => {
    let resolveRequest: ((result: SiteStatusResult) => void) | undefined;
    getSiteStatusMock.mockImplementation(
      () =>
        new Promise<SiteStatusResult>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const store = await loadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeSiteStatus(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    resolveRequest?.({ status: 'operational' });
    await flushAsync();
    // 无订阅者：迟到结果不得写回/广播。
    expect(listener).toHaveBeenCalledTimes(1);

    // 重新订阅：快照已随清理恢复为 neutral，不复用迟到的 operational。
    getSiteStatusMock.mockImplementation(() => new Promise<SiteStatusResult>(() => {}));
    const nextListener = vi.fn();
    const unsubscribeNext = store.subscribeSiteStatus(nextListener);
    expect(nextListener).toHaveBeenCalledWith({ status: 'unavailable' });

    unsubscribeNext();
  });

  it('取消订阅函数幂等：重复调用不会误删其他订阅者或重复清理', async () => {
    const { subscribeSiteStatus } = await loadStore();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeSiteStatus(first);
    const unsubscribeSecond = subscribeSiteStatus(second);
    await flushAsync();

    unsubscribeFirst();
    unsubscribeFirst();

    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
  });
});

describe('siteStatusStore — Workers 每日上限', () => {
  it('收到 workersLimit 结果时通知 Workers 订阅者', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });
    const { subscribeWorkersLimit } = await loadStore();
    const listener = vi.fn();

    const unsubscribe = subscribeWorkersLimit(listener);
    await flushAsync();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('普通失败（unavailable / 网络错误）不触发 Workers 提示', async () => {
    const { subscribeWorkersLimit } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeWorkersLimit(listener);

    getSiteStatusMock.mockResolvedValue({ status: 'unavailable' });
    await flushAsync();
    expect(listener).not.toHaveBeenCalled();

    getSiteStatusMock.mockRejectedValue(new Error('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('10 分钟内最多提示一次，窗口过后可再次提示', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });
    const { subscribeWorkersLimit } = await loadStore();
    const listener = vi.fn();
    const unsubscribe = subscribeWorkersLimit(listener);

    await flushAsync();
    expect(listener).toHaveBeenCalledTimes(1);

    // 5 分钟后再次命中上限：静默。
    vi.setSystemTime(new Date(START_TIME + 5 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(1);

    // 满 10 分钟后再次命中：允许再次提示。
    vi.setSystemTime(new Date(START_TIME + 10 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('重新加载 store（同一标签页刷新页面）后 10 分钟窗口仍生效', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });

    const firstStore = await loadStore();
    const firstListener = vi.fn();
    const unsubscribeFirst = firstStore.subscribeWorkersLimit(firstListener);
    await flushAsync();
    expect(firstListener).toHaveBeenCalledTimes(1);
    unsubscribeFirst();

    vi.setSystemTime(new Date(START_TIME + 60 * 1000));
    const secondStore = await loadStore();
    const secondListener = vi.fn();
    const unsubscribeSecond = secondStore.subscribeWorkersLimit(secondListener);
    await flushAsync();

    expect(secondListener).not.toHaveBeenCalled();
    unsubscribeSecond();
  });

  it('sessionStorage 不可用时回退模块级时间戳，仍能节流', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    try {
      getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });
      const { subscribeWorkersLimit } = await loadStore();
      const listener = vi.fn();
      const unsubscribe = subscribeWorkersLimit(listener);

      await flushAsync();
      expect(listener).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date(START_TIME + 60 * 1000));
      await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  it('没有 Workers 订阅者时不消耗提示窗口（后续订阅仍可收到下一次上限）', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });
    const { subscribeSiteStatus, subscribeWorkersLimit } = await loadStore();

    // 只有状态入口订阅时命中上限：不记账、不提示。
    const unsubscribeStatus = subscribeSiteStatus(vi.fn());
    await flushAsync();

    const listener = vi.fn();
    const unsubscribeWorkers = subscribeWorkersLimit(listener);
    // 共享已有轮询：下一次轮询命中上限时仍会提示（窗口未被消耗）。
    await vi.advanceTimersByTimeAsync(STATUS_REFRESH_INTERVAL_MS);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribeStatus();
    unsubscribeWorkers();
  });

  it('Workers 提示订阅也启动共享轮询（未挂载状态组件时仍能检测）', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable', workersLimit: true });
    const { subscribeWorkersLimit } = await loadStore();
    const listener = vi.fn();

    const unsubscribe = subscribeWorkersLimit(listener);
    await flushAsync();

    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
