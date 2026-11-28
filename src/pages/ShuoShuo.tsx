/**
 * 说说页：朋友圈式短动态列表（每页 10 条，构建期分页）。
 *
 * 内容源是仓库内的 shuoshuo/*.md（Pages CMS「说说」集合），构建期解析为
 * generated/shuoshuo.json 后在 SSG 阶段直出，首帧即完整可读。
 *
 * 2026-11 调整（用户要求减少构建产物）：
 *   - 不再逐条生成 HTML，逐条独立链接与分享按钮一并取消；
 *   - 改为「每 10 条一个页面」：/shuoshuo（第 1 页）、/shuoshuo/page/<n>，
 *     每页都是真实存在的静态 HTML，爬虫无需执行 JS；
 *   - 评论区已于此前下线，说说只承载内容本身。
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { SHUOSHUO_PER_PAGE, shuoshuoPageCount, shuoshuoPagePath, buildShuoShuoDescription } from '@/utils/shuoshuo';
import { getInitialShuoShuo, getShuoShuoTitle } from '@/services/shuoshuo';
import { ShuoShuoItem } from '@/components/ShuoShuoItem';
import { ImageViewer, type ImageViewerImage } from '@/components/ImageViewer';
import { SearchField } from '@/components/SearchField';
import { ContentStatus } from '@/components/ContentStatus';
import { Pagination } from '@/components/Pagination';
import { stripMarkdown } from '@/utils/markdownText';

// 页面级描述：Seo meta 与页面级 schema 共用同一口径。
const SHUOSHUO_INTRO = '这里是一块类似 PLDDUCK 朋友圈的短动态小天地，用一句话、一张图记录当下的想法与生活片段。';

export const ShuoShuo = () => {
  const allItems = getInitialShuoShuo();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const params = useParams<{ page?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [previewGallery, setPreviewGallery] = useState<{ images: ImageViewerImage[]; index: number } | null>(null);

  const totalPages = shuoshuoPageCount(allItems.length);
  // 路由参数是 /shuoshuo/page/<n> 的 n；/shuoshuo 自身没有该参数（第 1 页）。
  // 越界页码一律收敛到合法范围，避免前端算出空页而 SSG 侧却是另一套口径。
  const requestedPage = Number(params.page);
  const currentPage = Math.min(
    Math.max(1, Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.trunc(requestedPage) : 1),
    totalPages,
  );

  // 正文剥离结果按 id 缓存：搜索过滤每次按键都对全部说说重跑正则链，内容不变时应复用。
  const strippedContents = useMemo(() => {
    const cache = new Map<string, string>();
    for (const item of allItems) {
      cache.set(item.id, stripMarkdown(item.content));
    }
    return cache;
  }, [allItems]);

  // ── 独立搜索：仅匹配说说正文内容（markdown 剥离后），大小写不敏感 ──
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allItems;
    return allItems.filter((item) => (strippedContents.get(item.id) ?? '').toLowerCase().includes(query));
  }, [allItems, searchQuery, strippedContents]);
  const hasSearchQuery = searchQuery.trim().length > 0;

  // 搜索时展示全部命中项（搜索结果不分页），未搜索时按页切分。
  const visibleItems = useMemo(() => {
    if (hasSearchQuery) return filteredItems;
    const start = (currentPage - 1) * SHUOSHUO_PER_PAGE;
    return filteredItems.slice(start, start + SHUOSHUO_PER_PAGE);
  }, [currentPage, filteredItems, hasSearchQuery]);

  // 深链定位：?id=<说说 id> 时该条若在当前页则高亮（不再有逐条页面）。
  const locateTargetId = searchParams.get('id');
  const highlightedItemId =
    locateTargetId && visibleItems.some((item) => item.id === locateTargetId) ? locateTargetId : null;

  const firstItem = visibleItems[0];
  const description = buildShuoShuoDescription({
    excerpt: firstItem ? strippedContents.get(firstItem.id) : undefined,
    authorName: siteConfig.author.name,
    date: firstItem?.date,
    siteTitle: siteConfig.title,
    page: currentPage,
    totalPages,
  });

  const handlePageChange = (page: number) => {
    // 站内分页走客户端路由；远端直访对应路径时由 SSG 直出同一份 HTML。
    navigate(shuoshuoPagePath(page));
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo
        title={currentPage > 1 ? `说说（第 ${currentPage} 页）` : '说说'}
        description={description}
        url={shuoshuoPagePath(currentPage)}
        // 页面级 schema 由本组件输出（SSG 已标记 schemaFromSeo，不再重复注入）。
        structuredData={[
          ...buildSiteSchemas(description),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: currentPage > 1 ? `说说（第 ${currentPage} 页） | ${siteConfig.title}` : `说说 | ${siteConfig.title}`,
            description,
            url: absoluteSiteUrl(shuoshuoPagePath(currentPage), siteConfig.url),
            inLanguage: 'zh-CN',
            isPartOf: {
              '@type': 'WebSite',
              name: siteConfig.title,
              url: absoluteSiteUrl('/', siteConfig.url),
            },
          },
          // 条目列表用 ItemList 指路（说说没有逐条页面，统一指向当前页）。
          ...(visibleItems.length > 0
            ? [
                {
                  '@context': 'https://schema.org',
                  '@type': 'ItemList',
                  name: '说说列表',
                  numberOfItems: visibleItems.length,
                  itemListElement: visibleItems.map((item, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: getShuoShuoTitle(item),
                    url: absoluteSiteUrl(shuoshuoPagePath(currentPage), siteConfig.url),
                  })),
                },
              ]
            : []),
        ]}
      />

      {/* 卡片式页头：与站内其它栏目页一致的 surface 大色块。 */}
      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">说说</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-content-muted md:text-base">{SHUOSHUO_INTRO}</p>
        {allItems.length > 0 && (
          <p className="mt-2 text-xs leading-6 text-content-tertiary">
            共 {allItems.length} 条动态
            {totalPages > 1 && ` · 第 ${currentPage} / ${totalPages} 页`}，内容通过 Pages CMS 发布。
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
        <>
          <div className="mt-4 flex flex-col gap-3">
            {visibleItems.map((item) => (
              <div key={item.id} data-shuoshuo-id={item.id} className="scroll-mt-24">
                <ShuoShuoItem
                  item={item}
                  onPreview={(images, index) => setPreviewGallery({ images, index })}
                  isHighlighted={highlightedItemId === item.id}
                />
              </div>
            ))}
          </div>

          {/* 搜索时分页无意义（结果一次性全部展示），只在未搜索时出现分页。 */}
          {!hasSearchQuery && totalPages > 1 && (
            <div className="mt-6">
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex items-center gap-1.5 px-1 text-xs text-content-muted">
        <MessageCircle size={13} aria-hidden="true" />
        <span>最新动态排在最前；内容按 Pages CMS 的发布时间排序。</span>
      </div>

      {previewGallery && (
        <ImageViewer
          src={null}
          images={previewGallery.images}
          initialIndex={previewGallery.index}
          onClose={() => setPreviewGallery(null)}
        />
      )}
    </div>
  );
};
