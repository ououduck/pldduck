/**
 * 单条说说 / 留言的展示卡（列表与详情共用视觉语言）。
 *
 * 2026-11 改造成「一条内容 = 一个 Discussion」后，列表项不再是自己渲染全部评论，
 * 而是链到该条的详情页 —— 只有点进去（并且在那里留过言）的人才会收到那条的邮件通知，
 * 这正是要修的问题。
 */

import { Link } from 'react-router-dom';
import { MessageSquare, Smile } from 'lucide-react';
import type { DiscussionEntry } from '../types';
import { assetUrl } from '@/utils/siteUrl';
import { formatDiscussionDate, toDateTimeAttr } from '@/utils/discussionDate';
import { ProgressiveImage } from '@/components/ProgressiveImage';

interface DiscussionCardProps {
  entry: DiscussionEntry;
  /** 详情页路径（由调用方按区域拼好，如 /shuoshuo/12）。 */
  to: string;
  /** 列表最多展示几张配图（详情页传 0 表示不在卡片里渲染图片）。 */
  maxImages?: number;
  /** 是否展示摘要文字。 */
  showExcerpt?: boolean;
  className?: string;
}

const isLocalPath = (value: string) => value.startsWith('/') && !value.startsWith('//');
const toDisplaySrc = (value: string) => (isLocalPath(value) ? assetUrl(value) : value);

export const DiscussionCard = ({ entry, to, maxImages = 3, showExcerpt = true, className }: DiscussionCardProps) => {
  const images = entry.images.slice(0, Math.max(0, maxImages));
  const dateTime = toDateTimeAttr(entry.createdAt);

  return (
    <article
      className={`rounded-overlay bg-surface p-4 transition-colors hover:bg-surface-muted md:p-5 ${className ?? ''}`}
    >
      <header className="flex items-center gap-2 text-xs text-content-muted">
        <time dateTime={dateTime || undefined}>{formatDiscussionDate(entry.createdAt)}</time>
        {entry.author.login && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{entry.author.login}</span>
          </>
        )}
      </header>

      <h2 className="mt-2 text-[17px] font-semibold leading-7 text-content">
        <Link to={to} className="hover:text-accent">
          {entry.title}
        </Link>
      </h2>

      {showExcerpt && entry.excerpt && <p className="mt-1.5 text-sm leading-7 text-content-muted">{entry.excerpt}</p>}

      {images.length > 0 && (
        <div className={`mt-3 grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {images.map((image) => (
            <div key={image} className="overflow-hidden rounded-media bg-surface-muted">
              <ProgressiveImage
                src={toDisplaySrc(image)}
                alt=""
                effect="fade"
                wrapperClassName="h-24 w-full"
                className="h-24 w-full object-cover object-center"
              />
            </div>
          ))}
        </div>
      )}

      <footer className="mt-3 flex items-center gap-4 text-xs text-content-muted">
        <Link to={to} className="inline-flex items-center gap-1.5 hover:text-accent">
          <MessageSquare size={14} aria-hidden="true" />
          <span>{entry.commentCount > 0 ? `${entry.commentCount} 条评论` : '评论'}</span>
        </Link>
        {entry.reactionCount > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Smile size={14} aria-hidden="true" />
            <span>{entry.reactionCount}</span>
          </span>
        )}
      </footer>
    </article>
  );
};
