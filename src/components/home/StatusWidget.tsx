/**
 * 首页服务状态小部件：把侧栏底部的状态入口以小部件形态呈现。
 *
 * 与 `SiteStatusBadge` 同一套语义（见 ai-rules/site-status.md）：首帧固定渲染中性
 * 「服务状态」（`unavailable`），只有客户端 effect 订阅到上游四种真实状态才更新，
 * **只有 `operational` 显示绿色**；任何失败都回退中性，不得伪装成正常，也不得隐藏
 * 或禁用入口 —— 它始终可点击跳转状态页。轮询与并发去重全部由全局 `siteStatusStore`
 * 负责，本组件只订阅、不请求、不缓存。
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { resolveStatusPageUrl, SITE_STATUS_META, type SiteStatusValue } from '@/services/siteStatus';
import { subscribeSiteStatus } from '@/services/siteStatusStore';
import { Widget } from './Widget';

export const StatusWidget = () => {
  // 首帧必须与 SSR 输出一致：不读 API、不读时钟/随机值，固定中性兜底。
  const [status, setStatus] = useState<SiteStatusValue>('unavailable');

  useEffect(() => {
    // 订阅时立即回调当前快照；卸载时若无其他订阅者，store 会自行清理 timer 与监听。
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
    <Widget id="home-status" title="服务状态" index={7} className="lg:col-span-6 xl:col-span-4">
      <a
        href={statusPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        data-status={status}
        className="group flex min-h-12 min-w-0 items-center gap-2.5 rounded-control bg-surface-muted px-3 text-sm text-content transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
      >
        <Icon size={16} aria-hidden="true" className={`shrink-0 ${meta.iconClass}`} />
        <span aria-live="polite" className="min-w-0 flex-1 truncate font-medium">
          {meta.label}
        </span>
        <ExternalLink size={12} aria-hidden="true" className="shrink-0 opacity-60" />
      </a>

      <p className="mt-3 text-[11px] leading-relaxed text-content-muted">
        由 Better Stack 实时监测，每 60 秒自动刷新；点击查看状态页。
      </p>
    </Widget>
  );
};
