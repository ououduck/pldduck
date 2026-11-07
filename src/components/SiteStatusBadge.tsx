/**
 * 侧栏底部的服务状态入口：整块是一个指向 Better Stack 自定义状态页的外链。
 *
 * 首帧固定渲染中性「服务状态」（unavailable），拿到真实四态后才更新 —— SSR/SSG 与
 * 客户端水合首帧因此逐字一致，绿色勾选也绝不可能在收到 operational 之前出现。
 * 60s 轮询与「页面重新可见补刷」由全局 siteStatusStore 统一负责（与 Workers 上限
 * 提示共享同一份状态与同一条请求），组件只订阅、不自己起 timer。
 * 任何 API 失败都不隐藏、不禁用这个入口：它始终可点击跳转状态页（见 ai-rules/site-status.md）。
 */

import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { resolveStatusPageUrl, SITE_STATUS_META, type SiteStatusValue } from '@/services/siteStatus';
import { subscribeSiteStatus } from '@/services/siteStatusStore';

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
    // store 统一负责首轮请求、60s 轮询、页面重新可见补刷与并发去重；
    // 订阅时立即回调当前快照，组件只把最新状态落到本地 state。
    // 卸载（取消订阅）时若没有其他订阅者，store 会清理 interval 与 visibility 监听。
    return subscribeSiteStatus((result) => {
      setStatus(result.status);
    });
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
