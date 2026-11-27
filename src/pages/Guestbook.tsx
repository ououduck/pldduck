/**
 * 留言板页：访客留言列表（每条留言 = 一条独立 Discussion）。
 *
 * 2026-11 改造（用户反馈「留言板评论通知会发给所有留过言的人」）：GitHub 的邮件
 * 通知是 **Discussion 级**的 —— 一个 discussion 装全部留言时，任何留过言的人都会收到
 * 之后每一条无关留言的邮件，且没有 per-reply 订阅可调。因此改为
 * **一份留言 = 一条 Discussion**：
 *   - 本页是列表（构建期抓取，SSG 首帧直出），每条链到 /guestbook/<number>；
 *   - 详情页用 giscus 的 mapping="number" 锁定那一条，通知只落在参与过的人身上；
 *   - 发新留言 = 在 GitHub「留言板」分类下新建一条 Discussion（新建后触发一次部署）。
 */

import { Link } from 'react-router-dom';
import { ExternalLink, MessageSquareText, PenLine } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { Surface } from '@/components/ui/Surface';
import { DiscussionCard } from '@/components/DiscussionCard';
import { ContentStatus } from '@/components/ContentStatus';
import { buildNewDiscussionUrl, discussionPath } from '@/utils/discussion-core.mjs';
import { getInitialDiscussionList, hasDiscussionList } from '@/services/discussions';

// 留言板页描述：Seo meta 与站点级 schema 共用同一文案，保证一致。
const guestbookPageDescription =
  '在 跑路的duck 留言板留下你的足迹：闲聊、建议、问题反馈都可以，登录 GitHub 账号即可开始留言。';

export const Guestbook = () => {
  const entries = getInitialDiscussionList('guestbook');
  const dataAvailable = hasDiscussionList();
  const newUrl = siteConfig.guestbook?.categoryName
    ? buildNewDiscussionUrl({ repo: siteConfig.comments.repo, categorySlug: siteConfig.guestbook.categoryName })
    : '';

  return (
    <div className="mx-auto max-w-3xl pb-10 pt-6 md:pb-16 md:pt-10">
      <Seo
        title="留言板"
        description={guestbookPageDescription}
        url="/guestbook"
        // WebPage 与站点级 WebSite + Organization schema 一并输出，
        // 保证全站各页 schema 一致（SSG 已标记 schemaFromSeo，不再重复注入）。
        structuredData={[
          ...buildSiteSchemas(guestbookPageDescription),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: `留言板 | ${siteConfig.title}`,
            description: '访客留言板：闲聊、建议与问题反馈。',
            url: absoluteSiteUrl('/guestbook', siteConfig.url),
            inLanguage: 'zh-CN',
            isPartOf: {
              '@type': 'WebSite',
              name: siteConfig.title,
              url: absoluteSiteUrl('/', siteConfig.url),
            },
          },
        ]}
      />

      {/* 与说说页一致的卡片结构：页头与列表各一块大色块，不再使用跨页发丝线。 */}
      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">留言板</h1>
        <p className="mt-3 text-xs leading-6 text-content-tertiary">
          每份留言是一个独立讨论：只有在你留过言的那一份里，后续回复才会通知你。
        </p>
        {newUrl && (
          <a
            href={newUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-control bg-surface-muted px-3 text-[13px] font-medium text-content transition-colors hover:bg-surface"
          >
            <PenLine size={14} aria-hidden="true" />
            <span>写一条留言</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </header>

      {!siteConfig.giscusEnabled ? (
        <Surface
          variant="panel"
          className="mt-4 flex flex-col items-center gap-3 rounded-overlay p-8 text-center sm:p-10"
        >
          <MessageSquareText size={24} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">留言功能暂未开启，敬请期待。</p>
        </Surface>
      ) : entries.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {entries.map((entry) => (
            <DiscussionCard
              key={entry.number}
              entry={entry}
              to={discussionPath('guestbook', entry.number)}
              showExcerpt
            />
          ))}
        </div>
      ) : (
        <ContentStatus
          className="mt-4 rounded-overlay border-0 bg-surface"
          title={dataAvailable ? '还没有留言' : '留言列表暂时取不到'}
          description={
            dataAvailable
              ? '点上面的「写一条留言」到 GitHub 开一份新的留言讨论，稍后会自动出现在这里。'
              : '构建期没能从 GitHub 拉到留言列表（可能是接口失败或分类未配置），稍后刷新或重新部署即可恢复。'
          }
          variant={dataAvailable ? 'empty' : 'error'}
        />
      )}

      <div className="mt-4 px-1 text-xs text-content-muted">
        <Link to="/shuoshuo" className="inline-flex items-center gap-1.5 hover:text-accent">
          去看看说说
        </Link>
      </div>
    </div>
  );
};
