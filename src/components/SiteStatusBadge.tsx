/**
 * 侧栏底部的服务状态入口：整块是一个指向 Better Stack 自定义状态页的外链。
 *
 * 首帧固定渲染中性「服务状态」（unavailable），拿到真实四态后才更新 —— SSR/SSG 与
 * 客户端水合首帧因此逐字一致，绿色勾选也绝不可能在收到 operational 之前出现。
 * 任何 API 失败都不隐藏、不禁用这个入口：它始终可点击跳转状态页（见 ai-rules/site-status.md）。
 */

import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  getSiteStatus,
  resolveStatusPageUrl,
  SITE_STATUS_META,
  STATUS_REFRESH_INTERVAL_MS,
  type SiteStatusValue,
} from '@/services/siteStatus';

export interface SiteStatusBadgeProps {
  /** 外链点击后通知宿主（移动抽屉借此收起面板），与导航外链项同一语义。 */
  onExternalClick?: () => void;
  /** 抽屉动画进行中锁住交互（与导航行同一套守卫，动画结束前不触发跳转）。 */
  interactionDisabled?: boolean;
}

/** 与 SiteSidebar 的 IDLE_ROW_CLASS 保持一致：非激活导航行的既有 hover 配色。 */
const IDLE_ROW_CLASS =
  'text-zinc-600 hover:bg-zinc-100/80 hover:text-ink dark:text-zinc-300 dark:hover:bg-zinc-900/80 dark:hover:text-white';

export const SiteStatusBadge: React.FC<SiteStatusBadgeProps> = ({ onExternalClick, interactionDisabled }) => {
  // 首帧必须与 SSR 输出一致：不读 API、不读时钟/随机值，固定中性兜底。
  const [status, setStatus] = useState<SiteStatusValue>('unavailable');

  useEffect(() => {
    let disposed = false;
    let latestRequestId = 0;
    const controller = new AbortController();

    const refresh = () => {
      const requestId = ++latestRequestId;
      void getSiteStatus(controller.signal)
        .then((result) => {
          // 竞态保护：轮询与「页面重新可见」可能同时发起，只有最新一次能落库；
          // 卸载后（disposed 或 controller 已 abort）迟到的结果不得 setState。
          if (disposed || requestId !== latestRequestId) {
            return;
          }
          setStatus(result.status);
        })
        .catch(() => {
          // getSiteStatus 契约上不会 reject；这里仍兜住，保证失败时回到中性入口。
          if (disposed || requestId !== latestRequestId) {
            return;
          }
          setStatus('unavailable');
        });
    };

    refresh();

    // 60s 轮询：与 Worker 侧 60s 缓存对齐。
    const interval = window.setInterval(refresh, STATUS_REFRESH_INTERVAL_MS);
    // 后台标签页的定时器会被浏览器节流/冻结：回到前台时补一次，不等下一拍。
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // 取消本次等待（共享请求仍留给另一个挂载点），卸载后不再 setState。
      controller.abort();
    };
  }, []);

  const meta = SITE_STATUS_META[status];
  const Icon = meta.icon;
  const statusPageUrl = resolveStatusPageUrl();
  const ariaLabel =
    status === 'unavailable'
      ? '服务状态（在新窗口打开 Better Stack 状态页）'
      : `服务状态：${meta.label}（在新窗口打开 Better Stack 状态页）`;

  return (
    <a
      href={statusPageUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      aria-disabled={interactionDisabled || undefined}
      data-status={status}
      onClick={(event) => {
        if (interactionDisabled) {
          event.preventDefault();
          return;
        }
        onExternalClick?.();
      }}
      className={`nav-item flex w-full min-w-0 items-center gap-2.5 rounded-control px-2 py-2 text-sm font-semibold transition-colors ${IDLE_ROW_CLASS}${
        interactionDisabled ? ' cursor-not-allowed' : ''
      }`}
    >
      <span className="sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
        <Icon size={16} className={`transition-colors ${meta.iconClass}`} />
      </span>
      {/* nav-item-label：侧栏收起为图标条时随既有 CSS 淡出（不撤出布局） */}
      <span className="nav-item-label min-w-0 flex-1 truncate" aria-live="polite">
        {meta.label}
      </span>
      <ExternalLink size={11} aria-hidden="true" className="nav-item-external shrink-0 opacity-60" />
    </a>
  );
};
