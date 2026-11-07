/**
 * 站点服务状态数据层：同源 `GET /api/status`（Cloudflare Worker 代理 Better Stack
 * 状态页 API）→ 四态之一；任何失败一律回退 unavailable（中性「服务状态」）。
 *
 * 关键约束（见 ai-rules/site-status.md）：
 * - 只在客户端 effect 中调用；SSR/首帧不请求，组件首帧固定 unavailable，保证 SSG 水合一致；
 * - 任何异常（HTTP 1027/429/非 2xx、非 JSON、字段缺失、未知值、超时、网络断开）
 *   都不得抛出，统一返回 { status: 'unavailable' }，组件据此仍渲染可点击的兜底入口；
 * - 并发去重：桌面侧栏与移动抽屉可能同时挂载，同一时刻只发一个请求，完成即清空
 *   （不做长缓存，避免 60s 轮询拿到旧值）。
 */

import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Wrench } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { assetUrl } from '@/utils/siteUrl';

/** 展示用五态：四态来自状态页 API，unavailable 是前端兜底值。 */
export type SiteStatusValue = 'operational' | 'degraded' | 'downtime' | 'maintenance' | 'unavailable';

/** 状态页 API 允许上报的真实状态（unavailable 只由前端兜底产生，不属于上游值）。 */
export type SiteStatusLiveValue = Exclude<SiteStatusValue, 'unavailable'>;

export interface SiteStatusResult {
  status: SiteStatusValue;
  /** 上游状态页最后更新时间（ISO 字符串）；兜底或上游未给时缺省。 */
  updatedAt?: string;
}

/** 同源状态接口路径（Worker 只放行 GET /api/status）。 */
const STATUS_API_PATH = '/api/status';

/** 客户端请求超时：超时即中止并按 unavailable 兜底（Worker 侧另有 5s 上游超时）。 */
export const STATUS_REQUEST_TIMEOUT_MS = 8000;

/** 轮询间隔：与 Worker 的 60s Cache API TTL 对齐。 */
export const STATUS_REFRESH_INTERVAL_MS = 60_000;

/**
 * 状态页默认地址：按站点域名约定的兜底值，真实值由 siteConfig.statusPageUrl 或
 * 构建期 VITE_BETTERSTACK_STATUS_PAGE_URL 覆盖。全仓库只在这里出现一次，
 * 组件与服务都经 resolveStatusPageUrl() 取值，避免 URL 散落多处。
 */
const DEFAULT_STATUS_PAGE_URL = 'https://status.pldduck.com';

const LIVE_STATUS_VALUES: ReadonlySet<string> = new Set<SiteStatusLiveValue>([
  'operational',
  'degraded',
  'downtime',
  'maintenance',
]);

type SiteStatusIcon = typeof CheckCircle2;

export interface SiteStatusMeta {
  /** 展示文案（同时构成无障碍名称的一部分）。 */
  label: string;
  /** lucide 图标组件（复用现有依赖，不引入新包）。 */
  icon: SiteStatusIcon;
  /** 图标颜色（明暗两套）：中性兜底不得使用绿色/红色语义。 */
  iconClass: string;
}

/** 五态文案与视觉映射：组件只消费这里，避免文案/颜色在组件里再写一份。 */
export const SITE_STATUS_META: Record<SiteStatusValue, SiteStatusMeta> = {
  operational: {
    label: '所有服务正常',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  degraded: {
    label: '部分服务异常',
    icon: AlertTriangle,
    iconClass: 'text-amber-500 dark:text-amber-400',
  },
  downtime: {
    label: '服务中断',
    icon: AlertCircle,
    iconClass: 'text-red-600 dark:text-red-400',
  },
  maintenance: {
    label: '服务维护中',
    icon: Wrench,
    iconClass: 'text-sky-600 dark:text-sky-400',
  },
  // 中性兜底：既不是「正常」也不宣判故障，避免 API 失败时误导访客。
  unavailable: {
    label: '服务状态',
    icon: CircleDashed,
    iconClass: 'text-zinc-500 dark:text-zinc-400',
  },
};

/** 只接受 https 绝对地址：非法值（http/javascript:/空串等）一律不采用。 */
const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * 解析状态页地址，优先级：构建期 VITE_BETTERSTACK_STATUS_PAGE_URL → siteConfig.statusPageUrl
 * → 站点域名约定的默认值。只接受 https：非法值不采用，杜绝把 `javascript:`/`http:` 写进 href。
 * Token 绝不参与这里 —— 浏览器只需要公开状态页地址（Token 只存在于 Worker Secret）。
 */
export const resolveStatusPageUrl = (): string => {
  const fromEnv = import.meta.env.VITE_BETTERSTACK_STATUS_PAGE_URL as string | undefined;
  if (isHttpsUrl(fromEnv)) {
    return fromEnv.trim();
  }

  const configured = siteConfig.statusPageUrl;
  if (isHttpsUrl(configured)) {
    return configured.trim();
  }

  return DEFAULT_STATUS_PAGE_URL;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isLiveStatus = (value: unknown): value is SiteStatusLiveValue =>
  typeof value === 'string' && LIVE_STATUS_VALUES.has(value);

/** 统一兜底结果（每次返回新对象，调用方改写也影响不到下一次）。 */
const unavailableStatusResult = (): SiteStatusResult => ({ status: 'unavailable' });

/** 严格校验上游 payload：success === true 且 status ∈ 四态，否则一律 unavailable。 */
const parseSiteStatusPayload = (payload: unknown): SiteStatusResult => {
  if (!isRecord(payload) || payload.success !== true || !isLiveStatus(payload.status)) {
    return unavailableStatusResult();
  }

  const { updatedAt } = payload;
  return {
    status: payload.status,
    ...(typeof updatedAt === 'string' && updatedAt ? { updatedAt } : {}),
  };
};

/**
 * 单次请求 + 8s 超时。所有失败分支都返回 unavailable，绝不 reject
 * （组件因此不需要为「API 挂了」写一套额外的错误 UI）。
 */
const fetchSiteStatus = async (): Promise<SiteStatusResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(assetUrl(STATUS_API_PATH), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      // 1027（平台级拦截/限流）、429 等非 2xx：一律中性兜底，不向访客暴露细节。
      return unavailableStatusResult();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // 非 JSON（HTML 错误页 / 空响应）同样兜底。
      return unavailableStatusResult();
    }

    return parseSiteStatusPayload(payload);
  } catch {
    // 超时（AbortError）、网络断开、CORS 等：静默兜底，不打日志、不抛错。
    return unavailableStatusResult();
  } finally {
    clearTimeout(timeout);
  }
};

/** 模块级 in-flight：桌面侧栏与移动抽屉首轮同时挂载时只发一个请求。 */
let inFlightStatusRequest: Promise<SiteStatusResult> | null = null;

/**
 * 发起或复用当前在途请求。请求一结束就清空 in-flight —— 不做结果缓存，
 * 否则 60s 轮询会一直拿到旧值。
 */
const startStatusRequest = (): Promise<SiteStatusResult> => {
  if (!inFlightStatusRequest) {
    const tracked = fetchSiteStatus().finally(() => {
      // 只清自己：若期间被替换，不能误伤后来那条请求的在途标记。
      if (inFlightStatusRequest === tracked) {
        inFlightStatusRequest = null;
      }
    });
    inFlightStatusRequest = tracked;
  }

  return inFlightStatusRequest;
};

/**
 * 读取服务状态（合并并发请求），成功/失败都 resolve，永不 reject。
 *
 * 传入 signal 只取消「本次等待」（abort 时按 unavailable 结算），不会中止共享请求：
 * 桌面侧栏与移动抽屉同时挂载时，先卸载的那个不能把另一个的请求一起掐掉。
 */
export const getSiteStatus = (signal?: AbortSignal): Promise<SiteStatusResult> => {
  // 已经取消的等待不必再发请求（卸载后才挂载/立刻卸载等边界）。
  if (signal?.aborted) {
    return Promise.resolve(unavailableStatusResult());
  }

  const request = startStatusRequest();

  if (!signal) {
    return request;
  }

  return new Promise<SiteStatusResult>((resolve) => {
    const handleAbort = () => resolve(unavailableStatusResult());
    signal.addEventListener('abort', handleAbort, { once: true });
    void request.then((result) => {
      signal.removeEventListener('abort', handleAbort);
      resolve(result);
    });
  });
};
