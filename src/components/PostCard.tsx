/**
 * 文章卡片组件：文章列表与搜索结果的统一卡片（精选横排 + 普通竖排两种形态）。
 * 视觉上只保留封面圆角、标题 hover 与轻量元信息，不再用边框/白底/阴影包住整块内容；
 * 搜索结果页的桌面三列网格仍直接复用它。
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Pin, Share2 } from 'lucide-react';
import type { PostMetadata } from '@/types';
import { assetUrl } from '@/utils/siteUrl';
import { preloadPage } from '@/utils/preload';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { isPinnedFeaturedPost } from '@/utils/postSelection';

// 组件 props 类型（全仓库仅本文件使用，不导出避免公共 API 承诺）。
interface PostCardProps {
  post: PostMetadata;
  featured?: boolean;
  /** card：搜索页等三列网格用的竖排卡；banner：文章列表的横向横幅。 */
  variant?: 'card' | 'banner';
  onShare: (post: PostMetadata) => void;
}

/**
 * 文章卡片的标签行（最多展示 3 个）。低对比纯文字而非胶囊，避免每张卡都出现
 * 一排高噪点色块。模块级组件而非 PostCard 内联定义：内联组件每次渲染都会创建
 * 新的组件类型，导致标签子树（含 Link）被卸载并重新挂载，浪费 DOM 重建且使
 * memo 失效。
 */
const PostCardTags: React.FC<{ tags: string[]; className?: string }> = ({ tags, className = '' }) =>
  tags.length > 0 ? (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] ${className}`}>
      {tags.slice(0, 3).map((tag, index) => (
        <React.Fragment key={tag}>
          {index > 0 && (
            <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
              ·
            </span>
          )}
          <Link
            to={`/posts?tag=${encodeURIComponent(tag)}`}
            className="text-zinc-500 underline-offset-4 transition-colors hover:text-ink hover:underline dark:text-zinc-400 dark:hover:text-white"
            onClick={(event) => event.stopPropagation()}
          >
            {tag}
          </Link>
        </React.Fragment>
      ))}
    </div>
  ) : null;

const PostMetaSeparator = ({ className = 'text-zinc-300 dark:text-zinc-700' }: { className?: string }) => (
  <span aria-hidden="true" className={className}>
    ·
  </span>
);

const PostCardImpl: React.FC<PostCardProps> = ({ post, featured, variant = 'card', onShare }) => {
  const handleShareClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onShare(post);
  };

  const shareButton = (
    <button
      type="button"
      onClick={handleShareClick}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-500 dark:hover:text-white dark:focus-visible:outline-zinc-100"
      aria-label={`分享文章：${post.title}`}
    >
      <Share2 size={13} aria-hidden="true" />
    </button>
  );

  const pinned = isPinnedFeaturedPost(post);

  if (variant === 'banner') {
    return (
      <article
        className="relative flex min-h-48 min-w-0 flex-col overflow-hidden rounded-overlay bg-surface-muted sm:min-h-52 sm:flex-row"
        onMouseEnter={() => preloadPage(`/post/${post.id}`)}
      >
        <Link
          to={`/post/${post.id}`}
          className="absolute inset-0 z-0 block overflow-hidden bg-surface sm:relative sm:inset-auto sm:z-auto sm:w-[34%] sm:shrink-0"
          aria-label={`阅读文章：${post.title}`}
        >
          {post.coverImage ? (
            <ProgressiveImage
              src={assetUrl(post.coverImage)}
              alt={post.title}
              loading="lazy"
              fetchPriority="auto"
              width={post.coverWidth}
              height={post.coverHeight}
              sizes="(max-width: 639px) 100vw, 34vw"
              wrapperClassName="h-full w-full"
              className="h-full w-full object-cover object-center"
              effect="fade"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-[11px] tracking-[0.16em] text-content-muted">无封面</span>
            </div>
          )}
        </Link>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/35 to-transparent sm:hidden"
        />

        <div className="relative z-20 mt-auto flex min-w-0 flex-col p-4 text-white sm:mt-0 sm:flex-1 sm:p-5 sm:text-content md:p-6">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-white/70 sm:gap-x-2 sm:text-[11px] sm:text-content-muted">
            <span className="font-medium text-white sm:text-content">{post.category}</span>
            <PostMetaSeparator className="text-white/40 sm:text-zinc-400" />
            <span>{post.date}</span>
            <PostMetaSeparator className="text-white/40 sm:text-zinc-400" />
            <span>{post.readTime}</span>
            {typeof post.commentCount === 'number' && (
              <>
                <PostMetaSeparator className="text-white/40 sm:text-zinc-400" />
                <span title="来自 Giscus 评论区的评论数">{post.commentCount} 条评论</span>
              </>
            )}
            {featured && <span className="font-medium text-white sm:text-content">精选</span>}
            {pinned && (
              <span className="inline-flex items-center gap-1">
                <Pin size={10} aria-hidden="true" />
                置顶
              </span>
            )}
          </div>

          <Link to={`/post/${post.id}`} aria-label={`阅读文章：${post.title}`} className="mt-1.5 block sm:mt-2">
            <h2
              className={`line-clamp-2 font-serif font-bold leading-snug tracking-tight text-white decoration-white/40 underline-offset-4 hover:underline sm:leading-tight sm:text-content sm:decoration-line ${
                featured ? 'text-[17px] sm:text-2xl md:text-3xl' : 'text-[17px] sm:text-xl md:text-2xl'
              }`}
            >
              {post.title}
            </h2>
          </Link>

          <p className="mt-1 line-clamp-1 text-xs leading-5 text-white/75 sm:mt-2 sm:line-clamp-2 sm:text-sm sm:leading-6 sm:text-content-muted md:line-clamp-3">
            {post.excerpt}
          </p>

          <div className="mt-auto flex items-end justify-between gap-3 pt-2 sm:pt-4">
            <div className="hidden min-w-0 sm:block">
              <PostCardTags tags={post.tags} />
            </div>
            <span className="ml-auto hidden shrink-0 sm:inline-flex">{shareButton}</span>
          </div>
        </div>
      </article>
    );
  }

  if (featured) {
    return (
      <article className="col-span-full w-full" onMouseEnter={() => preloadPage(`/post/${post.id}`)}>
        <div className="grid gap-4 sm:grid-cols-5 sm:items-center sm:gap-6 md:gap-8">
          <Link
            to={`/post/${post.id}`}
            className="relative block aspect-[16/9] overflow-hidden rounded-media bg-zinc-200/60 dark:bg-zinc-900 sm:col-span-2 sm:aspect-[16/10]"
            aria-label={`阅读文章：${post.title}`}
          >
            {post.coverImage ? (
              <ProgressiveImage
                src={assetUrl(post.coverImage)}
                alt={post.title}
                loading="eager"
                fetchPriority="high"
                width={post.coverWidth}
                height={post.coverHeight}
                aspectRatio="16/10"
                sizes="(max-width: 639px) 100vw, 40vw"
                wrapperClassName="h-full w-full"
                className="h-full w-full object-cover"
                effect="fade"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[11px] tracking-[0.16em] text-zinc-400 dark:text-zinc-600">无封面</span>
              </div>
            )}
          </Link>

          <div className="flex min-w-0 flex-col sm:col-span-3">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              <span className="text-zinc-600 dark:text-zinc-300">{post.category}</span>
              <span aria-hidden="true">·</span>
              <span>精选</span>
              {pinned && (
                <span className="ml-auto inline-flex items-center gap-1">
                  <Pin size={10} aria-hidden="true" />
                  置顶
                </span>
              )}
            </div>

            <Link to={`/post/${post.id}`} aria-label={`阅读文章：${post.title}`} className="mt-2.5 block">
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-ink decoration-zinc-400 underline-offset-4 hover:underline dark:text-white dark:decoration-zinc-600 md:text-3xl">
                {post.title}
              </h2>
            </Link>

            <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400 md:text-[15px] md:leading-7">
              {post.excerpt}
            </p>

            <PostCardTags tags={post.tags} className="mt-3.5" />

            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span>{post.date}</span>
              <PostMetaSeparator />
              <span>{post.readTime}</span>
              {typeof post.commentCount === 'number' && (
                <>
                  <PostMetaSeparator />
                  <span title="来自 Giscus 评论区的评论数">{post.commentCount} 条评论</span>
                </>
              )}
              <span className="ml-auto">{shareButton}</span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-full min-w-0 flex-col" onMouseEnter={() => preloadPage(`/post/${post.id}`)}>
      <Link
        to={`/post/${post.id}`}
        className="relative block aspect-[16/10] overflow-hidden rounded-media bg-zinc-200/60 dark:bg-zinc-900"
        aria-label={`阅读文章：${post.title}`}
      >
        {post.coverImage ? (
          <ProgressiveImage
            src={assetUrl(post.coverImage)}
            alt={post.title}
            loading="lazy"
            fetchPriority="auto"
            width={post.coverWidth}
            height={post.coverHeight}
            aspectRatio="16/10"
            sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
            wrapperClassName="h-full w-full"
            className="h-full w-full object-cover"
            effect="fade"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[11px] tracking-[0.16em] text-zinc-400 dark:text-zinc-600">无封面</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col pt-3.5">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-600 dark:text-zinc-300">{post.category}</span>
          {pinned && (
            <span className="ml-auto inline-flex items-center gap-1">
              <Pin size={10} aria-hidden="true" />
              置顶
            </span>
          )}
        </div>

        <Link to={`/post/${post.id}`} aria-label={`阅读文章：${post.title}`} className="mt-2 block">
          {/* 列表页没有可见的 h2 区块标题：普通卡片用 h2（与精选卡一致），
              避免 SEO 审计的 h1 → h3 跳级；卡片标题本身就是文章入口。 */}
          <h2 className="line-clamp-2 min-h-11 text-base font-semibold leading-snug tracking-tight text-ink decoration-zinc-400 underline-offset-4 hover:underline dark:text-zinc-100 dark:decoration-zinc-600 md:text-[17px]">
            {post.title}
          </h2>
        </Link>

        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{post.excerpt}</p>

        <PostCardTags tags={post.tags} className="mt-3" />

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{post.date}</span>
            <PostMetaSeparator />
            <span>{post.readTime}</span>
            {typeof post.commentCount === 'number' && (
              <>
                <PostMetaSeparator />
                <span title="来自 Giscus 评论区的评论数">{post.commentCount} 条评论</span>
              </>
            )}
          </div>
          {shareButton}
        </div>
      </div>
    </article>
  );
};

// memo：列表的卡片渲染依赖 props 均为原始值或稳定引用（post 引用不变、
// onShare=setState），浅比较可跳过未受影响卡片。
export const PostCard = React.memo(PostCardImpl);
