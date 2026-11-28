/**
 * 说说条目：正文、九宫格图片（可预览）、日期与分享入口。
 *
 * 布局沿用站点当前的卡片式语言（`rounded-overlay bg-surface`），
 * 图片展示恢复为「九宫格」：1 张按 4:3 大图、2 张两列、3 张及以上三列。
 * 正文 Markdown 图片与九宫格图片共用同一 ImageViewer 画廊，
 * 点击任一图片都能在该条说说的全部图片间连续浏览。
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Share2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig } from '@config/site.config';
import { assetUrl } from '@/utils/siteUrl';
import type { ShuoShuo as ShuoShuoEntry } from '../types';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { formatDate } from '@/utils/date';
import { stripMarkdown } from '@/utils/markdownText';
import { shuoshuoPath } from '@/utils/shuoshuo';
import { shuoshuoCoverTransitionName, viewTransitionStyle } from '@/utils/viewTransition';
import type { ImageViewerImage } from '@/components/ImageViewer';

/** 九宫格列数：1 张铺满、2 张两列、其余三列（与九宫格惯例一致）。 */
const getImageGridClass = (count: number) => {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  return 'grid-cols-3';
};

/** 单张图片的裁切比例：独图更大更方，多图统一方格。 */
const getImageAspectClass = (count: number) => (count === 1 ? 'aspect-[4/3]' : 'aspect-square');

/** 单张图片的 sizes 提示（决定浏览器选哪档 srcset）。 */
const getImageSizes = (count: number) => {
  if (count === 1) return '(max-width: 640px) 80vw, 384px';
  if (count === 2) return '(max-width: 640px) 45vw, 240px';
  return '(max-width: 640px) 30vw, 160px';
};

/** Markdown 正文图片的站点资源解析：本地路径补 basePath，外链保持原样。 */
const resolveContentImageSrc = (src: string): string => (/^https?:\/\//i.test(src) ? src : assetUrl(src));

/** 画廊下标钳制（空画廊直接归零）。 */
const clampGalleryIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, index), length - 1);
};

/** 从 Markdown 正文里按文档顺序提取图片（与九宫格共用画廊）。 */
const extractMarkdownImages = (content: string): ImageViewerImage[] => {
  const images: ImageViewerImage[] = [];
  const pattern = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    const src = match[2];
    if (!src) continue;
    images.push({ src: resolveContentImageSrc(src), alt: match[1] || undefined, title: match[3] || undefined });
  }
  return images;
};

interface ShuoShuoItemProps {
  item: ShuoShuoEntry;
  /** 打开统一图片查看器：传入该条说说的完整画廊与点击图片的下标。 */
  onPreview: (images: ImageViewerImage[], index: number) => void;
  onShare: (item: ShuoShuoEntry) => void;
  /** 列表页展示「永久链接」入口指向独立页；详情页隐藏（自身即独立页）。 */
  showDetailLink?: boolean;
  /**
   * 为九宫格首图启用「一镜到底」共享转场（列表首图 → 详情页首图）。
   * 默认 false：调用方需保证同一视图内最多一条说说开启，见 utils/viewTransition.ts。
   */
  shareImageTransition?: boolean;
  /** 动画类：列表定位高亮等一次性强调（不参与共享转场）。 */
  isHighlighted?: boolean;
  /**
   * 预计算的分享摘要（stripMarkdown 结果）：列表页由 ShuoShuo.tsx 的
   * strippedContents 缓存传入，避免每次击键重渲染对每条说说重跑正则链。
   * 未传时回退组件内计算（详情页单条场景无成本顾虑）。
   */
  shareSnippet?: string;
}

export const ShuoShuoItem: React.FC<ShuoShuoItemProps> = ({
  item,
  onPreview,
  onShare,
  showDetailLink = true,
  shareImageTransition = false,
  shareSnippet,
}) => {
  // 分享/永久链接的 aria-label 共用同一段文本，只计算一次。
  const snippet = shareSnippet ?? (stripMarkdown(item.content).slice(0, 24) || item.date);

  // 画廊：正文 Markdown 图片在前（文档顺序），九宫格图片在后 —— 与卡片内
  // 视觉顺序一致；点击任一图片都能在该条说说的全部图片间连续浏览。
  const gallery = useMemo<ImageViewerImage[]>(() => {
    const contentImages = extractMarkdownImages(item.content ?? '');
    const gridImages = (item.images ?? []).map((src, index) => ({
      src: assetUrl(src),
      alt: `说说图片 ${index + 1}`,
    }));
    return [...contentImages, ...gridImages];
  }, [item.content, item.images]);

  // 正文 Markdown 图片渲染器（画廊下标取自 gallery，随 gallery 重建）。
  const markdownComponents = useMemo<Components>(
    () => ({
      img: ({ src, alt, title, node: _node, ...props }) => {
        const rawSrc = typeof src === 'string' ? src : '';
        const resolvedSrc = rawSrc ? resolveContentImageSrc(rawSrc) : '';
        const galleryIndex = gallery.findIndex((image) => image.src === resolvedSrc);
        return (
          <button
            type="button"
            onClick={() => onPreview(gallery, clampGalleryIndex(galleryIndex >= 0 ? galleryIndex : 0, gallery.length))}
            className="block w-full rounded-media focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={alt ? `预览图片：${alt}` : '预览图片'}
          >
            <ProgressiveImage
              {...props}
              src={resolvedSrc}
              alt={alt || ''}
              title={title}
              loading="lazy"
              effect="fade"
              wrapperClassName="w-full"
              className="w-full cursor-zoom-in rounded-media"
            />
          </button>
        );
      },
      // 裸 URL 自动成链后的外链安全属性（GFM 显式链接同样走这里）。
      a: ({ href, children, node: _node, ...props }) => {
        const isExternal = /^https?:\/\//i.test(href ?? '');
        if (!isExternal) {
          return (
            <a href={href} {...props}>
              {children}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      },
    }),
    [gallery, onPreview],
  );

  const gridImages = item.images ?? [];
  // 九宫格首图参与「一镜到底」：列表首图 → 详情页首图连续变形（名字按条目区分）。
  const firstImageTransitionStyle = viewTransitionStyle(shuoshuoCoverTransitionName(item.id), shareImageTransition);

  return (
    <article className="rounded-overlay bg-surface p-4 transition-colors hover:bg-surface-muted md:p-5">
      <header className="flex items-center gap-2 text-xs text-content-muted">
        <span className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-surface-muted">
          <ProgressiveImage
            src={assetUrl(siteConfig.author.avatar)}
            alt=""
            wrapperClassName="h-full w-full"
            className="h-full w-full object-cover"
            effect="fade"
          />
        </span>
        <span className="font-medium text-content">{siteConfig.author.name}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={item.date}>
          {formatDate(item.date, 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
        </time>
      </header>

      {item.content && (
        <div className="prose prose-invert mt-3 max-w-none text-[15px] leading-7 text-content prose-p:my-1.5 prose-a:break-all prose-li:my-0.5 prose-blockquote:my-2 prose-blockquote:not-italic">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {item.content}
          </ReactMarkdown>
        </div>
      )}

      {gridImages.length > 0 && (
        <div className="relative mt-3">
          {/* 图片数量徽标：多图时一眼可见总量 */}
          {gridImages.length > 1 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/90"
            >
              {gridImages.length} 图
            </span>
          )}
          <div
            className={`grid gap-1.5 sm:gap-2 ${getImageGridClass(gridImages.length)} ${gridImages.length === 1 ? 'max-w-sm' : ''}`}
          >
            {gridImages.map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() =>
                  onPreview(gallery, clampGalleryIndex(gallery.length - gridImages.length + index, gallery.length))
                }
                style={index === 0 ? firstImageTransitionStyle : undefined}
                className={`group relative block w-full overflow-hidden rounded-media bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${getImageAspectClass(gridImages.length)}`}
                aria-label={`查看图片 ${index + 1}，共 ${gallery.length} 张`}
              >
                <ProgressiveImage
                  src={assetUrl(src)}
                  alt={`说说图片 ${index + 1}`}
                  loading="lazy"
                  effect="fade"
                  sizes={getImageSizes(gridImages.length)}
                  wrapperClassName="h-full w-full"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 卡片底部操作栏：永久链接（独立页入口，利于爬虫发现/收录）+ 分享按钮 */}
      <footer className="mt-3 flex items-center justify-between border-t border-line pt-2">
        {showDetailLink ? (
          <Link
            to={shuoshuoPath(item.id)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`查看这条说说：${snippet}`}
          >
            <Link2 size={14} aria-hidden="true" />
            永久链接
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onShare(item)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`分享这条说说：${snippet}`}
        >
          <Share2 size={14} aria-hidden="true" />
          分享
        </button>
      </footer>
    </article>
  );
};
