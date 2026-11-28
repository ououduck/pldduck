/**
 * 说说条目：微信朋友圈式九宫格排版，纯展示 + 图片预览。
 *
 * 排版口径（对齐微信朋友圈）：
 * - 图片统一为正方形、1:1 裁切，网格固定三列；
 * - 网格宽度取内容列的一个固定比例（不是铺满整行），1 张时用单图大尺寸；
 * - 2 张、4 张时按朋友圈习惯**留空最后一格**，不做拉伸或两列重排；
 * - 间距 4px，圆角 2px（朋友圈也是极小圆角，配合站内 rounded-control 令牌）。
 *
 * 交互：点击任一图片打开统一 ImageViewer 画廊（正文图片 + 九宫格图片共用同一画廊）。
 * 不提供分享按钮与永久链接入口 —— 说说不再有逐条独立页面（2026-11 用户要求）。
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { siteConfig } from '@config/site.config';
import { assetUrl } from '@/utils/siteUrl';
import type { ShuoShuo as ShuoShuoEntry } from '../types';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { formatDate } from '@/utils/date';
import type { ImageViewerImage } from '@/components/ImageViewer';

/** Markdown 正文图片的站点资源解析：本地路径补 basePath，外链保持原样。 */
const resolveContentImageSrc = (src: string): string => (/^https?:\/\//i.test(src) ? src : assetUrl(src));

/** 画廊下标钳制（空画廊直接归零）。 */
const clampGalleryIndex = (index: number, length: number): number =>
  length <= 0 ? 0 : Math.min(Math.max(0, index), length - 1);

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

/**
 * 朋友圈九宫格的列数：1 张单列、2 张与 4 张两列、其余三列。
 * 这是微信朋友圈的实际排布（4 张排成 2×2，不会拉成一行四格）。
 */
const getGridColumns = (count: number): number => {
  if (count <= 1) return 1;
  if (count === 2 || count === 4) return 2;
  return 3;
};

/**
 * 九宫格的视觉宽度（对齐朋友圈：网格不铺满整行）：
 * - 1 张：窄单图，最宽 12rem；
 * - 2 张 / 4 张：两列网格自然更窄；
 * - 3 张以上：三列网格，最宽 22rem。
 * 用 max-w + w-full 表达，小屏自动收缩，不会撑出横向滚动。
 */
const getGridWidthClass = (count: number): string => {
  const columns = getGridColumns(count);
  if (columns === 1) return 'w-full max-w-[12rem]';
  if (columns === 2) return 'w-full max-w-[15rem]';
  return 'w-full max-w-[22rem]';
};

interface ShuoShuoItemProps {
  item: ShuoShuoEntry;
  /** 打开统一图片查看器：传入该条说说的完整画廊与点击图片的下标。 */
  onPreview: (images: ImageViewerImage[], index: number) => void;
  /** 列表页给首条说说做定位高亮（?id=<id> 深链使用）。 */
  isHighlighted?: boolean;
}

export const ShuoShuoItem: React.FC<ShuoShuoItemProps> = ({ item, onPreview, isHighlighted = false }) => {
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
  const gridColumns = getGridColumns(gridImages.length);

  return (
    <article
      className={`rounded-overlay bg-surface p-4 transition-colors hover:bg-surface-muted md:p-5 ${
        isHighlighted ? 'ring-2 ring-accent' : ''
      }`}
    >
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
        <div
          className={`mt-3 grid gap-1 ${getGridWidthClass(gridImages.length)}`}
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {gridImages.map((src, index) => (
            <button
              key={`${src}-${index}`}
              type="button"
              onClick={() =>
                onPreview(gallery, clampGalleryIndex(gallery.length - gridImages.length + index, gallery.length))
              }
              className="group relative block aspect-square w-full overflow-hidden rounded-control bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={`查看图片 ${index + 1}，共 ${gallery.length} 张`}
            >
              <ProgressiveImage
                src={assetUrl(src)}
                alt={`说说图片 ${index + 1}`}
                loading="lazy"
                effect="fade"
                sizes={gridImages.length === 1 ? '(max-width: 640px) 60vw, 192px' : '(max-width: 640px) 30vw, 112px'}
                wrapperClassName="h-full w-full"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </article>
  );
};
