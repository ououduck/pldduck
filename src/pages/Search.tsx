/**
 * 搜索页：全文搜索独立页（q 参数驱动，带 q 时 noindex）。
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { SearchField } from '@/components/SearchField';
import { usePostSearch } from '@/hooks/usePostSearch';
import { useSharedElementTransition } from '@/hooks/useSharedElementTransition';
import type { PostSearchScope } from '@/services/posts';
import { PostCard } from '@/components/PostCard';
import type { PostMetadata } from '../types';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { clearSearchQueryParams, setSearchQueryParams } from '@/utils/searchParams';
import { siteConfig } from '@config/site.config';

const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));

const SEARCH_SCOPE_OPTIONS: Array<{ value: PostSearchScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'content', label: '正文内容' },
  { value: 'title', label: '仅标题' },
];

const SEARCH_SCOPE_HINTS: Record<PostSearchScope, string> = {
  all: '支持按标题、标签、摘要与正文搜索',
  content: '只在摘要和正文内容中搜索，不匹配标题',
  title: '只匹配文章标题，适合按标题关键字快速定位',
};

/**
 * 独立搜索页 /search?q=...：复用 searchPosts 评分排序与 usePostSearch 防抖逻辑，
 * 是全站唯一的搜索入口（顶栏按钮 / Ctrl+K / 移动端导航均跳转到本页）。
 * SSG 预渲染无 q 参数的默认搜索界面；带 q 的搜索结果在客户端执行（与首页 ?q= 一致）。
 */
export const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') || '';
  // 搜索范围与 URL ?scope= 参数联动（ai-rules/search.md 约定）：刷新/分享/后退
  // 前进均保持范围选择；切换范围不丢查询（setSearchParams 基于现有参数增删）。
  const scopeFromUrl = searchParams.get('scope') as PostSearchScope | null;
  const isKnownScope = (scope: string | null): scope is PostSearchScope =>
    scope !== null && SEARCH_SCOPE_OPTIONS.some((option) => option.value === scope);
  // 非法/缺失的 scope 统一视为 'all'，供 URL→状态同步使用。注意状态初始化固定为
  // 'all'（与 SSG 预渲染的无参 /search 界面一致，避免带 ?scope= 直访时水合冲突），
  // 由下方 effect 在水合后把 URL 值同步进状态（与 ?q= 同一策略）。
  const normalizedScopeFromUrl: PostSearchScope = isKnownScope(scopeFromUrl) ? scopeFromUrl : 'all';
  // 用户最近一次点击的范围值：与 lastEditedQueryRef 同一竞态防护 ——
  // v7_startTransition 下 setSearchParams 提交延迟，快速连点两个范围时
  // 旧 URL 值回写会把状态回退（闪回旧范围）。
  const lastEditedScopeRef = useRef<PostSearchScope | null>(null);
  // 用户最近一次通过输入框编辑的查询值：区分「URL 更新还在 startTransition
  // 延迟中」与「URL 确实来自导航」（与 Home/Archive/Tags 页同一竞态防护）。
  const lastEditedQueryRef = useRef<string | null>(null);
  // 输入框聚焦标记：聚焦期间（用户正在输入/刚编辑完）URL 变化一律不回写
  // 输入框，杜绝任何事件交错下「输入内容被 URL 同步回退」的可能；失焦时
  // 同步清空 lastEditedQueryRef，恢复 URL 驱动的同步（后退/前进/粘贴链接）。
  const searchInputFocusedRef = useRef(false);
  const [searchScope, setSearchScope] = useState<PostSearchScope>('all');
  const [sharePost, setSharePost] = useState<PostMetadata | null>(null);
  // 一镜到底（首条结果封面 → 文章封面）只在支持 View Transitions 且未要求减少动效时开启。
  const sharedElementTransition = useSharedElementTransition();
  const { searchQuery, isSearching, searchError, results, handleSearch, setSearchQuery, clearSearch, hasSearchQuery } =
    // 不把 URL 的 ?q= 作为 useState 初始值：SSG 预渲染的是无 q 的默认界面，
    // 首帧用空查询渲染可保证带 q 直访时客户端首帧与服务端 HTML 一致（水合无冲突）；
    // 下方 effect 在水合后把 queryFromUrl 同步进搜索。
    usePostSearch({
      scope: searchScope,
    });

  useEffect(() => {
    // 单向同步（URL → 输入框），仅在「URL 值不是用户最近编辑产生」时生效：
    // v7_startTransition 下 setSearchParams 提交异步延迟，击键期间 queryFromUrl
    // 仍是旧值，若此时回写 setSearchQuery 会把刚输入的内容回退掉（闪变/丢字），
    // 并让 usePostSearch 空查询分支把结果重置回全量列表。
    // 焦点守卫：输入框聚焦期间一律跳过回写（用户正在编辑，URL 永不覆盖输入）。
    if (searchInputFocusedRef.current && lastEditedQueryRef.current !== null) {
      return;
    }
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current !== queryFromUrl) {
      return;
    }
    if (queryFromUrl !== searchQuery) {
      setSearchQuery(queryFromUrl);
    }
    // URL 已追平最近编辑值：清空守卫，恢复 URL 驱动同步 —— 此前 ref 只写不重置，
    // 用户编辑过一次后浏览器后退/前进（同 pathname）与粘贴带 ?q= 的链接都会被
    // 永久短路，URL 与搜索 UI 失同步。
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current === queryFromUrl) {
      lastEditedQueryRef.current = null;
    }
  }, [queryFromUrl, searchQuery, setSearchQuery]);

  // 范围参数（URL → 状态）：后退/前进/粘贴带 ?scope= 的链接时恢复范围选择。
  // 与 q 同步同构：最近编辑值未与 URL 追平前跳过回写，追平后清空守卫。
  useEffect(() => {
    if (lastEditedScopeRef.current !== null && lastEditedScopeRef.current !== normalizedScopeFromUrl) {
      return;
    }
    if (normalizedScopeFromUrl !== searchScope) {
      setSearchScope(normalizedScopeFromUrl);
    }
    if (lastEditedScopeRef.current !== null && lastEditedScopeRef.current === normalizedScopeFromUrl) {
      lastEditedScopeRef.current = null;
    }
  }, [normalizedScopeFromUrl, searchScope]);

  const handleSearchChange = (query: string) => {
    lastEditedQueryRef.current = query;
    handleSearch(query);
    setSearchParams((previous) => setSearchQueryParams(previous, query), { replace: true });
  };

  const handleClearSearch = () => {
    lastEditedQueryRef.current = '';
    clearSearch();
    setSearchParams((previous) => clearSearchQueryParams(previous), { replace: true });
  };

  const handleScopeChange = (scope: PostSearchScope) => {
    lastEditedScopeRef.current = scope;
    setSearchScope(scope);
    // 保留现有查询与其他参数，仅增删 scope：切换范围不丢查询。
    setSearchParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        if (scope === 'all') {
          nextParams.delete('scope');
        } else {
          nextParams.set('scope', scope);
        }
        return nextParams;
      },
      { replace: true },
    );
  };

  const activeScopeHint = SEARCH_SCOPE_HINTS[searchScope];

  // 与 SSG 的 schemaFromSeo 标记配套：/search 的页面级 schema 由 Seo 组件输出
  // （SSG 不再注入），与归档/标签/说说等页面模式一致。
  const searchPageDescription = hasSearchQuery
    ? `在 跑路的duck 中搜索「${searchQuery}」的结果页，按相关度排序展示匹配文章。`
    : '在 跑路的duck 全站搜索文章：支持按标题、标签、摘要与正文内容检索，快速定位感兴趣的技术分享与工具测评。';
  const searchStructuredData = [
    ...buildSiteSchemas(searchPageDescription),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: hasSearchQuery ? `搜索：${searchQuery} | ${siteConfig.title}` : `搜索 | ${siteConfig.title}`,
      description: searchPageDescription,
      url: absoluteSiteUrl('/search', siteConfig.url),
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteConfig.title,
        url: absoluteSiteUrl('/', siteConfig.url),
      },
    },
  ];

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      {/* 带 q 参数时 Seo 组件自动输出 noindex（与首页内联搜索一致）；无 q 时正常索引 */}
      <Seo
        title={hasSearchQuery ? `搜索：${searchQuery}` : '搜索'}
        description={searchPageDescription}
        structuredData={searchStructuredData}
      />

      {/* 卡片式页头：与说说/留言以外的所有栏目页统一（rounded-overlay bg-surface）。 */}
      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">搜索</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-content-muted md:text-base">
          在整站范围内检索文章，支持标题、标签、摘要与正文内容。
        </p>
        <p className="mt-2 text-xs leading-6 text-content-tertiary">
          {hasSearchQuery
            ? isSearching && results.length === 0
              ? '正在搜索…'
              : `找到 ${results.length} 条结果`
            : '全站文章检索'}
        </p>
      </header>

      {/* 搜索卡片：输入框 + 范围切换 + 快捷键提示，同一块卡片内完成 */}
      <section aria-label="搜索设置" className="mt-4 rounded-overlay bg-surface p-5 md:p-6">
        <SearchField
          size="large"
          value={searchQuery}
          onValueChange={handleSearchChange}
          onClear={handleClearSearch}
          placeholder="搜索标题、标签与正文内容…"
          aria-label="搜索文章"
          containerClassName="w-full"
          autoFocus
          onFocus={() => {
            searchInputFocusedRef.current = true;
          }}
          onBlur={() => {
            // 失焦 = 编辑结束：清除最近编辑守卫，恢复 URL 驱动的同步
            // （否则后退/前进/粘贴带 ?q= 的链接会被永久短路）。
            searchInputFocusedRef.current = false;
            lastEditedQueryRef.current = null;
          }}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div role="group" aria-label="搜索范围" className="flex flex-wrap gap-1.5">
            {SEARCH_SCOPE_OPTIONS.map((option) => {
              const isActive = searchScope === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleScopeChange(option.value)}
                  className={`inline-flex min-h-9 items-center rounded-control px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? 'bg-surface-muted text-content'
                      : 'text-content-muted hover:bg-surface-muted hover:text-content'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {/* 只做静态提示，不新增快捷键逻辑：Ctrl/Cmd+K 由 Layout 的命令面板统一处理 */}
          <p className="hidden shrink-0 items-center gap-1.5 text-[11px] leading-none text-content-tertiary sm:flex">
            <kbd className="rounded-micro border border-line px-1.5 py-1 font-sans">Ctrl / ⌘</kbd>
            <span aria-hidden="true">+</span>
            <kbd className="rounded-micro border border-line px-1.5 py-1 font-sans">K</kbd>
            <span>打开命令面板</span>
          </p>
        </div>
        <p className="mt-2.5 text-xs leading-5 text-content-tertiary">{activeScopeHint}</p>
      </section>

      <section className="mt-4" aria-label="搜索结果">
        {isSearching && results.length === 0 ? (
          <div aria-busy="true">
            <LoadingStatus label="正在搜索文章" />
            {/* 轻量骨架：与最终横幅卡片同构（封面块 + 文字条） */}
            <div className="mt-3 flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex animate-pulse flex-col overflow-hidden rounded-overlay bg-surface-muted motion-reduce:animate-none sm:grid sm:grid-cols-[minmax(0,34%)_minmax(0,1fr)]"
                >
                  <div className="aspect-[16/9] w-full bg-surface sm:aspect-auto sm:min-h-52" />
                  <div className="space-y-2.5 p-4 sm:p-5">
                    <div className="h-3 w-24 bg-surface" />
                    <div className="h-5 w-2/3 bg-surface" />
                    <div className="h-3 w-full bg-surface" />
                    <div className="h-3 w-4/5 bg-surface" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div aria-busy={isSearching || undefined}>
            {/* 重新搜索（已有旧结果）时保留旧结果展示，仅提示正在刷新，
                避免每次击键都整块闪回骨架屏（首次搜索无结果才显示骨架）。 */}
            {isSearching && results.length > 0 && (
              <div className="mb-3 flex items-center gap-2 text-xs text-content-tertiary">
                <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
                <span>正在搜索「{searchQuery}」的最新结果…</span>
              </div>
            )}
            {searchError ? (
              <ContentStatus
                className="rounded-overlay border-0 bg-surface"
                variant="error"
                title="搜索失败"
                description={searchError}
                actionLabel="清除搜索"
                onAction={handleClearSearch}
              />
            ) : hasSearchQuery ? (
              results.length > 0 ? (
                <div aria-live="polite" className="flex flex-col gap-3">
                  {results.map((post, index) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      variant="banner"
                      onShare={setSharePost}
                      // 只给第一条结果开启封面转场：同一视图内转场名必须唯一。
                      shareCoverTransition={sharedElementTransition && index === 0}
                    />
                  ))}
                </div>
              ) : (
                <ContentStatus
                  className="rounded-overlay border-0 bg-surface"
                  title="未找到匹配文章"
                  description={`没有找到与「${searchQuery}」相关的内容，尝试缩短关键词，或更换搜索范围。`}
                  actionLabel="清除搜索"
                  onAction={handleClearSearch}
                />
              )
            ) : (
              <ContentStatus
                className="rounded-overlay border-0 bg-surface"
                title="输入关键词开始搜索"
                description="支持按标题、标签、摘要与正文内容搜索，回车或点击结果即可打开文章。"
              />
            )}
          </div>
        )}
      </section>

      {sharePost && (
        <Suspense fallback={null}>
          <ShareModal
            isOpen={!!sharePost}
            onClose={() => setSharePost(null)}
            title={sharePost.title}
            excerpt={sharePost.excerpt}
            url={absoluteSiteUrl(`/post/${sharePost.id}`, window.location.origin)}
          />
        </Suspense>
      )}
    </div>
  );
};
