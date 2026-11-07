/**
 * 全站唯一的服务状态轮询 store：把「每 60s 刷新 + 标签页重新可见补刷」收敛成一份
 * 全局轮询，`SiteStatusBadge` 与 `WorkersLimitToast` 共享同一份状态与同一条请求，
 * 不再由每个组件各起一个 timer。
 *
 * 关键约束：
 * - 模块导入不得访问 window/document/sessionStorage；只在 subscribe 的客户端 effect
 *   中启动轮询，最后一个订阅者取消后清理 interval 与 visibility 监听；
 * - 轮询复用 `getSiteStatus()`（模块级 in-flight 去重），同一时刻只有一条请求；
 * - current 只作为新订阅者的初始快照，不用于跳过刷新，避免轮询一直拿到旧值；
 * - Workers 上限提示按标签页节流：sessionStorage 记录上次提示时间，10 分钟内最多
 *   提示一次；存储不可用时回退模块级时间戳（当前页面生命周期内仍然节流）。
 */

import { getSiteStatus, STATUS_REFRESH_INTERVAL_MS, type SiteStatusResult } from './siteStatus';

/** 订阅服务状态：订阅时立即收到当前快照，之后随全局轮询更新。 */
export type SiteStatusListener = (result: SiteStatusResult) => void;

/** 订阅 Workers 上限事件：仅在上限结果到达且通过 10 分钟节流后调用。 */
export type WorkersLimitListener = () => void;

/** 每标签页最多提示一次的窗口（10 分钟）。 */
export const WORKERS_LIMIT_NOTIFY_INTERVAL_MS = 10 * 60 * 1000;

/** sessionStorage 键：上次提示时间（sessionStorage 天然按标签页隔离）。 */
const WORKERS_LIMIT_STORAGE_KEY = 'dblog:workers-limit-notified-at';

/** 中性兜底结果：与 SSR/组件首帧一致（中性「服务状态」）。 */
const unavailableStatusResult = (): SiteStatusResult => ({ status: 'unavailable' });

const statusListeners = new Set<SiteStatusListener>();
const workersLimitListeners = new Set<WorkersLimitListener>();

/** 最近一次结果：只作为新订阅者的初始快照；无订阅者时重置，避免跨会话陈旧。 */
let currentStatus: SiteStatusResult = unavailableStatusResult();

/** sessionStorage 不可用时的回退时间戳（模块级，当前页面生命周期内仍能节流）。 */
let lastNotifiedAtFallback = 0;

let refreshIntervalId: number | null = null;
let visibilityListener: (() => void) | null = null;
/** 刷新代际号：可见性补刷与轮询可能并发，只有最新一次结果可以落库。 */
let latestRefreshId = 0;

const hasSubscribers = (): boolean => statusListeners.size > 0 || workersLimitListeners.size > 0;

/** 单个订阅者抛错不得中断其他订阅者（订阅者通常只是 setState）。 */
const notifyStatusListeners = (result: SiteStatusResult) => {
  statusListeners.forEach((listener) => {
    try {
      listener(result);
    } catch {
      // 忽略单个订阅者异常。
    }
  });
};

const notifyWorkersLimitListeners = () => {
  workersLimitListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // 忽略单个订阅者异常。
    }
  });
};

/** 读取上次提示时间；存储不可用/值非法时回退模块级时间戳。 */
const readLastNotifiedAt = (): number => {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(WORKERS_LIMIT_STORAGE_KEY);
      const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {
      // 隐私模式/存储被禁用：走模块级回退。
    }
  }
  return lastNotifiedAtFallback;
};

/** 记录提示时间：先写模块级回退，再尽量写 sessionStorage（失败不影响本次节流）。 */
const markNotifiedAt = (timestamp: number) => {
  lastNotifiedAtFallback = timestamp;

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(WORKERS_LIMIT_STORAGE_KEY, String(timestamp));
  } catch {
    // 仅失去跨页面刷新记忆，当前页面内仍由模块级时间戳节流。
  }
};

/**
 * 是否允许提示：距上次提示满 10 分钟才放行。
 * 时钟回拨（now - last < 0）按「窗口内」处理，宁可漏报一次也不连弹。
 */
const canNotifyWorkersLimit = (now: number): boolean => now - readLastNotifiedAt() >= WORKERS_LIMIT_NOTIFY_INTERVAL_MS;

/**
 * 收到 Workers 上限结果：没有订阅者时不消耗提示窗口；
 * 10 分钟窗口内直接静默，窗口外先记账再通知。
 */
const handleWorkersLimit = () => {
  if (workersLimitListeners.size === 0) {
    return;
  }

  const now = Date.now();
  if (!canNotifyWorkersLimit(now)) {
    return;
  }

  markNotifiedAt(now);
  notifyWorkersLimitListeners();
};

/** 广播一次新结果：先更新快照与状态订阅者，再按需触发一次上限提示。 */
const publish = (result: SiteStatusResult) => {
  currentStatus = result;
  notifyStatusListeners(result);

  if (result.workersLimit) {
    handleWorkersLimit();
  }
};

/**
 * 刷新一次：失败按中性值兜底（getSiteStatus 契约上不 reject，这里仍兜住）。
 * 结果落地前校验「仍有订阅者」且「没有更新的刷新」——全部卸载后迟到的结果
 * 不得写回 current，也不得触发提示。
 */
const refresh = async (): Promise<void> => {
  const refreshId = ++latestRefreshId;
  let result: SiteStatusResult;

  try {
    result = await getSiteStatus();
  } catch {
    result = unavailableStatusResult();
  }

  if (!hasSubscribers() || refreshId !== latestRefreshId) {
    return;
  }

  publish(result);
};

const handleVisibilityChange = () => {
  // 后台标签页的定时器会被节流/冻结：回到前台时立刻补刷，不等下一拍轮询。
  if (document.visibilityState === 'visible') {
    void refresh();
  }
};

/**
 * 启动全局轮询（幂等）：已有轮询时后来者共享，不重复起 timer、不重复请求。
 * SSR/非浏览器环境直接跳过（组件只在客户端 effect 中订阅）。
 */
const startPolling = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (refreshIntervalId !== null) {
    return;
  }

  void refresh();
  refreshIntervalId = window.setInterval(() => {
    void refresh();
  }, STATUS_REFRESH_INTERVAL_MS);
  visibilityListener = handleVisibilityChange;
  document.addEventListener('visibilitychange', handleVisibilityChange);
};

/** 清理全局轮询：清 interval、移除 visibility 监听并作废仍在途的结果。 */
const stopPolling = () => {
  if (refreshIntervalId !== null) {
    window.clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }

  if (visibilityListener && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }

  // 让在途请求的 refreshId 失配，迟到的结果直接丢弃。
  latestRefreshId += 1;
};

/** 最后一个订阅者离开后彻底停表，并把快照恢复为中性兜底。 */
const releaseIfIdle = () => {
  if (hasSubscribers()) {
    return;
  }

  stopPolling();
  currentStatus = unavailableStatusResult();
  // Workers 上限节流时间戳刻意保留：10 分钟窗口按标签页计算，与订阅生命周期无关。
};

/**
 * 订阅全站服务状态：立即回调当前快照（初始为 unavailable），随后随全局轮询更新。
 * 返回取消订阅函数；最后一个订阅者取消后轮询与监听全部清理。
 */
export const subscribeSiteStatus = (listener: SiteStatusListener): (() => void) => {
  statusListeners.add(listener);

  try {
    listener(currentStatus);
  } catch {
    // 初始快照回调异常不影响后续轮询。
  }

  startPolling();

  let unsubscribed = false;
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    statusListeners.delete(listener);
    releaseIfIdle();
  };
};

/**
 * 订阅 Workers 上限事件：同样启动/共享全局轮询；只在新的 workersLimit 结果到达
 * 且通过 10 分钟节流后通知。刻意不补发历史结果 —— 组件重挂载不会重复弹窗。
 */
export const subscribeWorkersLimit = (listener: WorkersLimitListener): (() => void) => {
  workersLimitListeners.add(listener);
  startPolling();

  let unsubscribed = false;
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    workersLimitListeners.delete(listener);
    releaseIfIdle();
  };
};
