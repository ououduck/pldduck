/**
 * 留言详情页（/guestbook/:number）：一份留言 + 它自己的评论区。
 *
 * 与说说详情同一机制（见 ShuoShuoDetail.tsx）：giscus `mapping="number"` 精确锁定这一条
 * Discussion，只有参与过这份留言的人才收到它的回复通知。这是 2026-11 修复
 * 「留言板/说说回复会通知所有留过言的人」的核心。
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

const GUESTBOOK_DETAIL_DESCRIPTION = '跑路的duck 留言板的一份留言与它的回复。';

export const GuestbookDetail = () => {
  const { number } = useParams<{ number: string }>();
  const parsed = Number(number);
  const entry = useMemo(
    () => (Number.isFinite(parsed) && parsed > 0 ? getInitialDiscussion('guestbook', parsed) : undefined),
    [parsed],
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl pb-10 pt-6 md:pb-16 md:pt-10">
        <Seo
          title="留言不存在"
          description="这份留言不存在或已被删除。"
          url={discussionPath('guestbook', parsed)}
          noindex
        />
        <ContentStatus
          className="rounded-overlay border-0 bg-surface"
          title="找不到这份留言"
          description="它可能已被删除，或链接里的编号不对。"
          variant="error"
          actionLabel="返回留言板"
          onAction={() => {
            window.location.assign('/guestbook');
          }}
        />
        <div className="mt-4 px-1 text-xs">
          <Link to="/guestbook" className="inline-flex items-center gap-1.5 text-content-muted hover:text-accent">
            <ArrowLeft size={13} aria-hidden="true" />
            <span>返回留言板</span>
          </Link>
        </div>
      </div>
    );
  }

  const description = buildDiscussionMetaDescription({
    excerpt: entry.excerpt || GUESTBOOK_DETAIL_DESCRIPTION,
    siteTitle: siteConfig.title,
    surface: 'guestbook',
  });

  return (
    <div className="mx-auto max-w-3xl pb-10 pt-6 md:pb-16 md:pt-10">
      <Seo
        title={entry.title}
        description={description}
        url={discussionPath('guestbook', entry.number)}
        type="article"
        publishedTime={entry.createdAt}
        modifiedTime={entry.updatedAt}
        structuredData={[
          ...buildSiteSchemas(description),
          {
            '@context': 'https://schema.org',
            '@type': 'DiscussionForumPosting',
            headline: entry.title,
            articleBody: entry.excerpt || entry.title,
            datePublished: entry.createdAt,
            dateModified: entry.updatedAt,
            url: absoluteSiteUrl(discussionPath('guestbook', entry.number), siteConfig.url),
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

        {/* 迁移内容的原作者署名（同说说详情）。 */}
        {(() => {
          const byline = readMigrationByline(entry.body);
          if (!byline) return null;
          return (
            <p className="mt-4 border-t border-line pt-3 text-xs leading-6 text-content-tertiary">
              本条由 @{byline.author} 于 {byline.date} 发布的旧留言迁移而来
            </p>
          );
        })()}
      </article>

      <GiscusComments key={entry.number} mapping="number" term={entry.number} card />

      <div className="mt-4 px-1 text-xs">
        <Link to="/guestbook" className="inline-flex items-center gap-1.5 text-content-muted hover:text-accent">
          <ArrowLeft size={13} aria-hidden="true" />
          <span>返回留言板</span>
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
