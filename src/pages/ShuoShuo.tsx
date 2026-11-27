/**
 * 说说页：朋友圈式短动态列表。
 *
 * 内容源是仓库内的 shuoshuo/*.md（Pages CMS「说说」集合），构建期解析为
 * generated/shuoshuo.json 后在 SSG 阶段直出，列表与详情页首帧即完整可读。
 *
 * 评论区已于 2026-11 下线：说说只承载内容本身，互动统一收敛到文章评论。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { shuoshuoPath } from '@/utils/shuoshuo';
import { getInitialShuoShuo, getShuoShuoTitle } from '@/services/shuoshuo';
import type { ShuoShuo as ShuoShuoEntry } from '../types';
import { ShuoShuoItem } from '@/components/ShuoShuoItem';
import { ImageViewer, type ImageViewerImage } from '@/components/ImageViewer';
import { SearchField } from '@/components/SearchField';
import { ShareModal } from '@/components/ShareModal';
import { ContentStatus } from '@/components/ContentStatus';
import { copyTextToClipboard } from '@/utils/clipboard';
import { stripMarkdown } from '@/utils/markdownText';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// 说说页描述：Seo meta 与页面级 schema 共用同一文案，保证一致。
const SHUOSHUO_DESCRIPTION =
  '跑路的duck 说说：类似朋友圈的短动态分享，用一句话、一张图记录当下的想法与生活片段，最新动态排在最前。';

/** URL 定位参数名：/shuoshuo?id=<说说 id> 打开页面后自动滚动定位到该条说说。 */
const LOCATE_PARAM = 'id';

export const ShuoShuo = () => {
  const shouldReduceMotion = useReducedMotion();
  const allItems = getInitialShuoShuo();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [previewGallery, setPreviewGallery] = useState<{ images: ImageViewerImage[]; index: number } | null>(null);
  const [shareTarget, setShareTarget] = useState<ShuoShuoEntry | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [autoCopied, setAutoCopied] = useState<boolean | null>(null);
  // 分享序号：快速连续分享多条说说时，先发出的自动复制结果晚到会被丢弃，
  // 避免旧说说的复制结果串台到新打开的弹窗。
  const shareSeqRef = useRef(0);
  // 卸载守卫：复制（fallback execCommand 路径可能较慢）可能跨过组件卸载
  //（分享后立即导航离开），卸载后不再 setState。
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 正文剥离结果按 id 缓存：搜索过滤每次按键都对全部说说重跑正则链
  //（O(条目数 × 正文长度)），内容不变时应复用。
  const strippedContents = useMemo(() => {
    const cache = new Map<string, string>();
    for (const item of allItems) {
      cache.set(item.id, stripMarkdown(item.content));
    }
    return cache;
  }, [allItems]);

  // ── 独立搜索：仅匹配说说正文内容（markdown 剥离后），大小写不敏感 ──
  const filteredItems = useMemo(() => {
    // toLowerCase（非 toLocaleLowerCase）：与全站搜索一致，locale 无关。
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allItems;
    return allItems.filter((item) => (strippedContents.get(item.id) ?? '').toLowerCase().includes(query));
  }, [allItems, searchQuery, strippedContents]);
  const hasSearchQuery = searchQuery.trim().length > 0;

  // ── 定位功能：URL ?id=<说说 id>，打开页面后自动滚动到对应说说并高亮 ──
  const locateTargetId = searchParams.get(LOCATE_PARAM);

  useEffect(() => {
    if (!locateTargetId) return;

    let cancelled = false;
    let attempt = 0;
    let timeoutId: number | undefined;

    const scrollToTarget = () => {
      if (cancelled) return;

      const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(locateTargetId) : locateTargetId;
      const element = document.querySelector<HTMLElement>(`[data-shuoshuo-id="${escapedId}"]`);

      if (element) {
        element.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      // 图片懒加载等可能引起布局变化，短暂重试直到元素可定位。
      if (attempt < 12) {
        attempt += 1;
        timeoutId = window.setTimeout(scrollToTarget, 150);
      }
    };

    const rafId = window.requestAnimationFrame(scrollToTarget);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
    };
  }, [locateTargetId, shouldReduceMotion]);

  // ── 分享：自动复制链接 + 弹出分享框，链接指向该条说说的独立页 /shuoshuo/<id> ──
  const handleShare = async (item: ShuoShuoEntry) => {
    const seq = ++shareSeqRef.current;
    const origin = typeof window !== 'undefined' ? window.location.origin : siteConfig.url;
    const url = absoluteSiteUrl(shuoshuoPath(item.id), origin);

    setShareUrl(url);
    setShareTarget(item);
    setAutoCopied(null);

    const copied = await copyTextToClipboard(url);
    // 分享目标已切换（快速连续分享）时丢弃过期结果，避免串台；
    // 组件已卸载时同样丢弃（复制异步可能跨过导航）。
    if (seq !== shareSeqRef.current || !mountedRef.current) return;
    setAutoCopied(copied);
  };

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
          ...(allItems.length > 0
            ? [
                {
                  '@context': 'https://schema.org',
                  '@type': 'ItemList',
                  name: '说说列表',
                  numberOfItems: allItems.length,
                  itemListElement: allItems.slice(0, 20).map((item, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: getShuoShuoTitle(item),
                    url: absoluteSiteUrl(shuoshuoPath(item.id), siteConfig.url),
                  })),
                },
              ]
            : []),
        ]}
      />

      {/* 卡片式页头：与站内其它栏目页一致的 surface 大色块。 */}
      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">说说</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-content-muted md:text-base">
          这里是一块类似 PLDDUCK 朋友圈的短动态小天地，用一句话、一张图记录当下的想法与生活片段。
        </p>
        {allItems.length > 0 && (
          <p className="mt-2 text-xs leading-6 text-content-tertiary">
            共 {allItems.length} 条动态，内容通过 Pages CMS 发布。
          </p>
        )}
      </header>

      {allItems.length > 0 && (
        <section aria-label="搜索说说" className="mt-4">
          <SearchField
            value={searchQuery}
            onValueChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            placeholder="搜索说说内容"
            clearLabel="清除搜索"
            aria-label="搜索说说内容"
          />
          <p className="sr-only" role="status" aria-live="polite">
            {hasSearchQuery ? `找到 ${filteredItems.length} 条相关说说` : `共 ${allItems.length} 条说说`}
          </p>
        </section>
      )}

      {allItems.length === 0 ? (
        <ContentStatus
          className="mt-4 rounded-overlay border-0 bg-surface"
          title="还没有说说"
          description="第一条动态发布后会自动出现在这里，内容在 Pages CMS 的「说说」集合中维护。"
          variant="empty"
        />
      ) : filteredItems.length === 0 ? (
        <ContentStatus
          className="mt-4 rounded-overlay border-0 bg-surface"
          title="没有匹配的说说"
          description={`没有找到与「${searchQuery.trim()}」相关的说说，换个关键词试试。`}
          variant="empty"
          actionLabel="清除搜索"
          onAction={() => setSearchQuery('')}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filteredItems.map((item) => (
            <div key={item.id} data-shuoshuo-id={item.id} className="scroll-mt-24">
              <ShuoShuoItem
                item={item}
                onPreview={(images, index) => setPreviewGallery({ images, index })}
                onShare={handleShare}
                shareSnippet={(strippedContents.get(item.id) ?? '').slice(0, 24) || item.date}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 px-1 text-xs text-content-muted">
        <MessageCircle size={13} aria-hidden="true" />
        <span>每条说说都有独立链接，方便单独分享与收藏。</span>
      </div>

      {previewGallery && (
        <ImageViewer
          src={null}
          images={previewGallery.images}
          initialIndex={previewGallery.index}
          onClose={() => setPreviewGallery(null)}
        />
      )}

      {shareTarget && (
        <ShareModal
          isOpen={Boolean(shareTarget)}
          onClose={() => {
            setShareTarget(null);
            setAutoCopied(null);
          }}
          // 标题取正文首行摘要：社交平台分享文案更有辨识度。
          title={getShuoShuoTitle(shareTarget, 24)}
          excerpt={strippedContents.get(shareTarget.id) ?? ''}
          url={shareUrl}
          autoCopied={autoCopied}
          contentLabel="这条说说"
        />
      )}
    </div>
  );
};
