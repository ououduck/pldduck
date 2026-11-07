/**
 * 留言板页：基于 giscus 讨论的访客留言区。
 */

import { MessageSquareText } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { Surface } from '@/components/ui/Surface';
import { GiscusComments } from '@/components/GiscusComments';

// 留言板页描述：Seo meta 与站点级 schema 共用同一文案，保证一致。
const guestbookPageDescription =
  '在 跑路的duck 留言板留下你的足迹：闲聊、建议、问题反馈都可以，登录 GitHub 账号即可开始留言。';

export const Guestbook = () => {
  return (
    <div className="mx-auto max-w-4xl pb-10 pt-6 md:pb-16 md:pt-10">
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

      {/* 编辑式页头：只保留衬线标题与一条发丝线，不输出英文眉题/图标。 */}
      <header className="mb-8 border-b border-line pb-7 md:mb-10 md:pb-9">
        <h1 className="font-serif text-4xl font-bold tracking-tight text-content md:text-5xl">留言板</h1>
      </header>

      {siteConfig.giscusEnabled ? (
        <GiscusComments mapping="number" term={siteConfig.guestbook.discussionId} />
      ) : (
        <Surface className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <MessageSquareText size={24} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">留言功能暂未开启，敬请期待。</p>
        </Surface>
      )}
    </div>
  );
};
