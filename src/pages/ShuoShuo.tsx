/**
 * 说说页：朋友圈式短动态列表。
 *
 * 2026-11 改造（用户反馈「留言板/说说评论通知会发给所有留过言的人」）：
 * GitHub 的邮件通知是 **Discussion 级**的，一个大 discussion 装全部说说时，
 * 任何留过言的人都会收到之后每一条无关评论的邮件，且没有 per-reply 订阅可调。
 * 因此改为 **一条说说 = 一条 Discussion**：
 *   - 本页是列表（构建期抓取，SSG 首帧直出），每条链到 /shuoshuo/<number>；
 *   - 详情页用 giscus 的 mapping="number" 锁定那一条，评论区只在该条下产生通知；
 *   - 发新说说 = 在 GitHub「说说」分类下新建一条 Discussion（新建后触发一次部署，
 *     列表才会出现新内容，见 .github/workflows/discussion-publish.yml）。
 */

import { Link } from 'react-router-dom';
import { ExternalLink, MessageCircle, PenLine } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { Surface } from '@/components/ui/Surface';
import { DiscussionCard } from '@/components/DiscussionCard';
import { ContentStatus } from '@/components/ContentStatus';
import { buildNewDiscussionUrl, discussionPath } from '@/utils/discussion-core.mjs';
import { getInitialDiscussionList, hasDiscussionList } from '@/services/discussions';

// 说说页描述：Seo meta 与页面级 schema 共用同一文案，保证一致。
const SHUOSHUO_DESCRIPTION =
  '跑路的duck 说说：类似朋友圈的短动态分享，用一句话、一张图记录当下的想法与生活片段，最新动态排在最前。';

export const ShuoShuo = () => {
  const entries = getInitialDiscussionList('shuoshuo');
  const dataAvailable = hasDiscussionList();
  const newUrl = siteConfig.shuoshuo?.categoryName
    ? buildNewDiscussionUrl({ repo: siteConfig.comments.repo, categorySlug: siteConfig.shuoshuo.categoryName })
    : '';
  // 站长入口：只有仓库写权限者能往「说说」分类里新建（分类为公告型时对访客只读）。
  const manageUrl = `https://github.com/${siteConfig.comments.repo}/discussions`;

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo
        title="说说"
        description={SHUOSHUO_DESCRIPTION}
        url="/shuoshuo"
        // 页面级 schema 由本组件输出（SSG 已标记 schemaFromSeo，不再重复注入）。
        structuredData={[
          ...buildSiteSchemas(SHUOSHUO_DESCRIPTION),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `说说 | ${siteConfig.title}`,
            description: SHUOSHUO_DESCRIPTION,
            url: absoluteSiteUrl('/shuoshuo', siteConfig.url),
            inLanguage: 'zh-CN',
            isPartOf: {
              '@type': 'WebSite',
              name: siteConfig.title,
              url: absoluteSiteUrl('/', siteConfig.url),
            },
          },
          // 条目列表用 ItemList 指路，让搜索/智能体知道每条说说有独立详情页。
          ...(entries.length > 0
            ? [
                {
                  '@context': 'https://schema.org',
                  '@type': 'ItemList',
                  numberOfItems: entries.length,
                  itemListElement: entries.slice(0, 20).map((entry, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: entry.title,
                    url: absoluteSiteUrl(discussionPath('shuoshuo', entry.number), siteConfig.url),
                  })),
                },
              ]
            : []),
        ]}
      />

      {/* 与留言板一致的卡片结构：页头与列表各一块大色块，不再使用跨页发丝线。 */}
      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">说说</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-content-muted md:text-base">
          这里是一块类似 PLDDUCK 朋友圈的短动态小天地。
        </p>
        {/* 通知说明必须写给读者看：每条说说是独立讨论，只有在该条下留过言才会收到它的后续通知。 */}
        <p className="mt-2 text-xs leading-6 text-content-tertiary">
          每条说说是一个独立讨论：只有在你留过言的那一条里，后续回复才会通知你。
        </p>
      </header>

      {!siteConfig.giscusEnabled ? (
        <Surface
          variant="panel"
          className="mt-4 flex flex-col items-center gap-3 rounded-overlay p-8 text-center sm:p-10"
        >
          <MessageCircle size={24} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">说说功能暂未开启，敬请期待。</p>
        </Surface>
      ) : entries.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {entries.map((entry) => (
            <DiscussionCard key={entry.number} entry={entry} to={discussionPath('shuoshuo', entry.number)} />
          ))}
        </div>
      ) : (
        <ContentStatus
          className="mt-4 rounded-overlay border-0 bg-surface"
          title={dataAvailable ? '还没有说说' : '说说列表暂时取不到'}
          description={
            dataAvailable
              ? '第一条动态发布后会自动出现在这里。'
              : '构建期没能从 GitHub 拉到说说列表（可能是接口失败或分类未配置），稍后刷新或重新部署即可恢复。'
          }
          variant={dataAvailable ? 'empty' : 'error'}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-content-muted">
        <Link to="/guestbook" className="inline-flex items-center gap-1.5 hover:text-accent">
          去留言板
        </Link>
        <a
          href={newUrl || manageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-accent"
        >
          <PenLine size={13} aria-hidden="true" />
          <span>在 GitHub 发布说说</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
};
