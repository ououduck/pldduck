/**
 * 新文章订阅引导：跳转 GitHub Issue 的 Subscribe 订阅入口，带外链安全属性。
 *
 * 视觉为轻量横条（surface 弱底 + 间距），去掉英文眉题与重卡片/图标框；
 * surface 色块已两态自适应，不再写 light/dark 两套底色。
 */

import { Bell, ExternalLink, Github } from 'lucide-react';

// 订阅追踪 issue：notify-post-update.yml 会往这里发新文章评论。
// issue 号与仓库变量 BLOG_NOTIFY_ISSUE_NUMBER 是同一份事实的两处副本，换 issue 要同时改。
export const ISSUE_SUBSCRIPTION_URL = 'https://github.com/ououduck/pldduck/issues/1';

export const IssueSubscriptionCard = () => {
  return (
    <aside className="rounded-surface bg-surface-muted px-4 py-4 sm:px-5" aria-labelledby="issue-subscription-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Bell size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-content-muted" />
          <div className="min-w-0">
            <h2 id="issue-subscription-heading" className="text-[13px] font-semibold text-content">
              订阅新文章提醒
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-content-muted">
              在 GitHub Issue 中点击 Subscribe，即可接收新文章的更新通知。
            </p>
          </div>
        </div>
        <a
          href={ISSUE_SUBSCRIPTION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-content transition-colors hover:bg-surface"
        >
          <Github size={15} aria-hidden="true" />
          <span>前往订阅</span>
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
};
