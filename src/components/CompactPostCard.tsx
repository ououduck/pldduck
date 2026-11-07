/**
 * 紧凑文章条目：阅读页「你可能还喜欢」与搜索页移动端结果共用，保证两处排版严格一致。
 * 轻量横幅：无外边框/白底/阴影，封面 4px 圆角 + 文字层级；移动端左图右文，sm 起上图下文。
 * 外层固定 h-full（由父级网格决定列宽/高度），内部不设固定高度，内容自然撑开。
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { PostMetadata } from '@/types';
import { assetUrl } from '@/utils/siteUrl';
import { formatDate } from '@/utils/date';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { preloadPage } from '@/utils/preload';

const formatMetaDate = (dateText?: string) => {
  if (!dateText) {
    return '';
  }

  return formatDate(dateText, 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

interface CompactPostCardProps {
  post: PostMetadata;
}

export const CompactPostCard: React.FC<CompactPostCardProps> = ({ post }) => (
  <Link
    to={`/post/${post.id}`}
    onMouseEnter={() => preloadPage(`/post/${post.id}`)}
    className="group flex h-full min-w-0 items-start gap-3 transition-colors sm:flex-col sm:gap-0"
  >
    {post.coverImage ? (
      <ProgressiveImage
        src={assetUrl(post.coverImage)}
        alt=""
        loading="lazy"
        width={post.coverWidth}
        height={post.coverHeight}
        wrapperClassName="aspect-video w-24 flex-none overflow-hidden rounded-micro bg-surface-muted sm:aspect-[16/10] sm:w-full"
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="flex aspect-video w-24 flex-none items-center justify-center rounded-micro bg-surface-muted text-[11px] text-content-muted sm:aspect-[16/10] sm:w-full">
        无封面
      </div>
    )}
    <div className="min-w-0 flex-1 py-0.5 sm:pt-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-content-muted">
        <span className="truncate">{post.category}</span>
        <span aria-hidden="true" className="opacity-50">
          ·
        </span>
        <span className="shrink-0 tabular-nums">{formatMetaDate(post.date)}</span>
      </div>
      <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-relaxed text-content decoration-content-muted underline-offset-4 transition-colors group-hover:underline">
        {post.title}
      </h3>
      <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-content-muted sm:line-clamp-2">{post.excerpt}</p>
    </div>
  </Link>
);
