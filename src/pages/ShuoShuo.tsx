/**
 * 说说页：类似朋友圈的短动态流，改为 giscus 内嵌 —— 公告分类下的一条 Discussion，
 * 每条评论即一条说说；仅作者（写权限者）可发表，访客可浏览/点赞。
 * 排序默认「最新在前」由仓库根 giscus.json 的 defaultCommentOrder 控制（全站生效）。
 */

import { MessageCircle } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { Surface } from '@/components/ui/Surface';
import { GiscusComments } from '@/components/GiscusComments';

// 说说页描述：Seo meta 与页面级 schema 共用同一文案，保证一致。
const SHUOSHUO_DESCRIPTION =
  '跑路的duck 说说：类似朋友圈的短动态分享，用一句话、一张图记录当下的想法与生活片段，最新动态排在最前。';

export const ShuoShuo = () => {
  return (
    <div className="mx-auto max-w-2xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo
        title="说说"
        description={SHUOSHUO_DESCRIPTION}
        url="/shuoshuo"
        // 页面级 schema 由本组件输出（SSG 已标记 schemaFromSeo，不再重复注入）。
        // 说说内容改由 giscus 运行时从 GitHub 讨论拉取，不再枚举 ItemList 子页。
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
        ]}
      />

      <header className="mb-6 border-b border-zinc-200 pb-8 dark:border-zinc-800 md:pb-10">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          <MessageCircle size={14} aria-hidden="true" />
          ShuoShuo · Moments
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-5xl">说说</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
          这里是一块类似 PLDDUCK 朋友圈的短动态小天地。
        </p>
      </header>

      {siteConfig.giscusEnabled ? (
        <GiscusComments mapping="number" term={siteConfig.shuoshuo.discussionId} />
      ) : (
        <Surface variant="panel" className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <MessageCircle size={24} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">说说功能暂未开启，敬请期待。</p>
        </Surface>
      )}
    </div>
  );
};
