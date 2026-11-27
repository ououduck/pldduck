/**
 * 说说详情页（/shuoshuo/:number）：一条说说 + 它自己的评论区。
 *
 * 这是 2026-11 评论通知改造的核心：评论区用 giscus 的 `mapping="number"` 精确锁定
 * 这一条 Discussion，所以只有参与过这一条的人才会收到它的邮件通知 —— 而不再是
 * 「留过言就收到所有说说/留言的回复」。
 *
 * SSR 一致性：条目来自构建期内联的 generated/discussions.json（eager glob），
 * 首帧与 SSG 输出逐字一致；取不到条目时显示「找不到这条说说」，不发起任何请求。
 */

import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { GiscusComments } from '@/components/GiscusComments';
import { DiscussionMarkdown } from '@/components/DiscussionMarkdown';
import { ImageViewer } from '@/components/ImageViewer';
import { ContentStatus } from '@/components/ContentStatus';
import { formatDiscussionDateTime, toDateTimeAttr } from '@/utils/discussionDate';
import {
  buildDiscussionMetaDescription,
  discussionPath,
  readMigrationByline,
  stripMigrationArtifacts,
} from '@/utils/discussion-core.mjs';
import { getInitialDiscussion } from '@/services/discussions';

export const ShuoShuoDetail = () => {
  const { number } = useParams<{ number: string }>();
  const parsed = Number(number);
  // 旧说说深链（/shuoshuo/<id>，id 是自建管线的 slug）与本站详情页共用同一路径形状：
  // 非纯正整数的参数一律当退役深链，回列表页（与改造前的 301 契约一致）。
  const isLegacyDeepLink = !/^\d+$/.test(String(number ?? ''));
  const entry = useMemo(
    () => (Number.isFinite(parsed) && parsed > 0 ? getInitialDiscussion('shuoshuo', parsed) : undefined),
    [parsed],
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  if (isLegacyDeepLink) {
    return <Navigate to="/shuoshuo" replace />;
  }

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
        <Seo
          title="说说不存在"
          description="这条说说不存在或已被删除。"
          url={discussionPath('shuoshuo', parsed)}
          noindex
        />
        <ContentStatus
          className="rounded-overlay border-0 bg-surface"
          title="找不到这条说说"
          description="它可能已被删除，或链接里的编号不对。"
          variant="error"
          actionLabel="返回说说列表"
          onAction={() => {
            window.location.assign('/shuoshuo');
          }}
        />
        <div className="mt-4 px-1 text-xs">
          <Link to="/shuoshuo" className="inline-flex items-center gap-1.5 text-content-muted hover:text-accent">
            <ArrowLeft size={13} aria-hidden="true" />
            <span>返回说说列表</span>
          </Link>
        </div>
      </div>
    );
  }

  const description = buildDiscussionMetaDescription({
    excerpt: entry.excerpt || entry.title,
    siteTitle: siteConfig.title,
    surface: 'shuoshuo',
  });

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo
        title={entry.title}
        description={description}
        url={discussionPath('shuoshuo', entry.number)}
        type="article"
        publishedTime={entry.createdAt}
        modifiedTime={entry.updatedAt}
        structuredData={[
          ...buildSiteSchemas(description),
          {
            '@context': 'https://schema.org',
            '@type': 'SocialMediaPosting',
            headline: entry.title,
            articleBody: entry.excerpt || entry.title,
            datePublished: entry.createdAt,
            dateModified: entry.updatedAt,
            url: absoluteSiteUrl(discussionPath('shuoshuo', entry.number), siteConfig.url),
            inLanguage: 'zh-CN',
            ...(entry.author.login
              ? {
                  author: {
                    '@type': 'Person',
                    name: entry.author.login,
                    ...(entry.author.url ? { url: entry.author.url } : {}),
                  },
                }
              : {}),
          },
        ]}
      />

      <article className="rounded-overlay bg-surface p-6 md:p-8">
        <header>
          <h1 className="font-sans text-2xl font-bold leading-9 tracking-tight text-content md:text-3xl md:leading-10">
            {entry.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
            <time dateTime={toDateTimeAttr(entry.createdAt) || undefined}>
              {formatDiscussionDateTime(entry.createdAt)}
            </time>
            {entry.author.login && <span>{entry.author.login}</span>}
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-accent"
            >
              <span>在 GitHub 查看</span>
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
        </header>

        <div className="mt-4 text-[15px] text-content md:text-base">
          <DiscussionMarkdown
            content={stripMigrationArtifacts(entry.body)}
            onPreviewImage={({ src }) => {
              setPreviewSrc(src);
            }}
          />
        </div>

        {/* 迁移内容的原作者署名：新 Discussion 的作者必然是仓库主，不单独展示就丢了原作者。 */}
        {(() => {
          const byline = readMigrationByline(entry.body);
          if (!byline) return null;
          return (
            <p className="mt-4 border-t border-line pt-3 text-xs leading-6 text-content-tertiary">
              本条由 @{byline.author} 于 {byline.date} 发布的旧说说迁移而来
            </p>
          );
        })()}
      </article>

      <GiscusComments key={entry.number} mapping="number" term={entry.number} card />

      <div className="mt-4 px-1 text-xs">
        <Link to="/shuoshuo" className="inline-flex items-center gap-1.5 text-content-muted hover:text-accent">
          <ArrowLeft size={13} aria-hidden="true" />
          <span>返回说说列表</span>
        </Link>
      </div>

      {previewSrc && (
        <ImageViewer
          src={previewSrc}
          alt={entry.title}
          onClose={() => {
            setPreviewSrc(null);
          }}
        />
      )}
    </div>
  );
};
