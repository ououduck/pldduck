/**
 * 标签页：标签云聚合视图，支持标签筛选与搜索。
 *
 * 视觉走「极简编辑式」：页头只留标题与统计（无大写英文眉题）、标签云靠字号/字重/
 * 颜色分层（不用粗下划线或重胶囊）、选中标签后的文章列表用发丝线分隔的轻量条目。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SearchField } from '@/components/SearchField';
import { siteConfig } from '@config/site.config';
import { getInitialPosts, getPosts } from '@/services/posts';
import type { PostMetadata } from '../types';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { clearSearchQueryParams, setSearchQueryParams } from '@/utils/searchParams';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { usePostSearch } from '@/hooks/usePostSearch';
import { getDateTimestamp } from '@/utils/date';

const buildTagList = (posts: PostMetadata[]) => {
  const tagMap = new Map<string, PostMetadata[]>();

  posts.forEach((post) => {
    (Array.isArray(post.tags) ? post.tags : [])
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
      .forEach((tag) => {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }

        tagMap.get(tag)!.push(post);
      });
  });

  return Array.from(tagMap.entries())
    .map(([name, taggedPosts]) => ({
      name,
      count: taggedPosts.length,
      posts: taggedPosts.sort((a, b) => getDateTimestamp(b.date) - getDateTimestamp(a.date)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
};

// 构建期 SSG：posts.json 已通过 eager glob 内联，SSR 阶段即可同步渲染标签云，
// 客户端水合首帧一致，爬虫无需执行 JS 即可读取全部标签与文章数。
const initialPosts = getInitialPosts();

export const Tags = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allPosts, setAllPosts] = useState<PostMetadata[]>(initialPosts);
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const selectedTag = searchParams.get('tag');
  const queryFromUrl = searchParams.get('q') || '';
  // 用户最近一次通过输入框编辑的查询值：区分「URL 更新还在 startTransition
  // 延迟中」与「URL 确实来自导航」（与 Home/Search/Archive 页同一竞态防护）。
  const lastEditedQueryRef = useRef<string | null>(null);
  const { searchQuery, isSearching, searchError, results, handleSearch, setSearchQuery, clearSearch, hasSearchQuery } =
    // 不把 URL 的 ?q= 作为 useState 初始值（与 Search 页一致）：SSG 预渲染的是
    // 无 q 的默认界面，首帧用空查询渲染可保证带 q 直访时客户端首帧与服务端
    // HTML 一致（水合无冲突）；下方 effect 在水合后把 queryFromUrl 同步进搜索。
    usePostSearch({
      emptyResults: allPosts,
    });

  useEffect(() => {
    let cancelled = false;

    // 首次加载数据已由 eager glob 同步提供；仅“重新加载”（loadAttempt > 0）
    // 或初始数据缺失时才有必要走异步重取。
    if (loadAttempt === 0 && initialPosts.length > 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getPosts()
      .then((posts) => {
        if (cancelled) {
          return;
        }

        setAllPosts(posts);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error('标签数据加载失败:', error);
        setLoadError('标签数据加载失败，请稍后刷新重试。');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const handleSearchChange = (query: string) => {
    // 单向同步守卫：本次编辑落地前（URL 尚未提交），URL → state 回写必须被
    // 拦截，否则每次击键输入被回退一次（v7_startTransition 下 setSearchParams
    // 的提交是异步延迟的，期间 queryFromUrl 仍是旧值）。
    lastEditedQueryRef.current = query;
    handleSearch(query);
    setSearchParams((previous) => setSearchQueryParams(previous, query), { replace: true });
  };

  const handleClearSearch = () => {
    lastEditedQueryRef.current = '';
    clearSearch();
    setSearchParams((previous) => clearSearchQueryParams(previous), { replace: true });
  };

  useEffect(() => {
    // 单向同步（URL → 输入框），仅在「URL 值不是用户最近编辑产生」时生效：
    // v7_startTransition 下 setSearchParams 提交异步延迟，击键期间 queryFromUrl
    // 仍是旧值，若此时回写 setSearchQuery 会把刚输入的内容回退掉（闪变/丢字）。
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current !== queryFromUrl) {
      return;
    }
    if (queryFromUrl !== searchQuery) {
      setSearchQuery(queryFromUrl);
    }
    // URL 已追平最近编辑值：清空守卫，恢复 URL 驱动同步（后退/前进/粘贴链接）。
    if (lastEditedQueryRef.current !== null && lastEditedQueryRef.current === queryFromUrl) {
      lastEditedQueryRef.current = null;
    }
  }, [queryFromUrl, searchQuery, setSearchQuery]);

  const tags = useMemo(() => buildTagList(results), [results]);
  const allTags = useMemo(() => buildTagList(allPosts), [allPosts]);
  // 派生状态纳入 useMemo 链：selectedTagInfo 每次渲染对 allTags.find、
  // maxCount 对 tags 全量 Math.max，列表增长后线性放大。
  const { selectedTagInfo, filteredSelectedTagPosts, maxCount } = useMemo(() => {
    const info = selectedTag ? (allTags.find((tag) => tag.name === selectedTag) ?? null) : null;
    return {
      selectedTagInfo: info,
      filteredSelectedTagPosts: info
        ? info.posts.filter((post) => results.some((result) => result.id === post.id))
        : [],
      maxCount: Math.max(...tags.map((tag) => tag.count), 1),
    };
  }, [allTags, results, selectedTag, tags]);

  // 标签云三档视觉层级：字号 / 字重 / 颜色（主文字 vs 次要文字）。
  // 阈值语义保持不变（>0.7 最大档、>0.4 中档、其余小档），只把每档的样式收敛得
  // 更克制 —— 不再用粗下划线/重胶囊，交互反馈交给 hover 下划线与变深文字色。
  const getTagSize = (count: number) => {
    const ratio = count / maxCount;
    if (ratio > 0.7) return 'text-lg font-semibold text-content sm:text-xl';
    if (ratio > 0.4) return 'text-base font-medium text-content sm:text-lg';
    return 'text-sm font-normal text-content-muted sm:text-base';
  };

  const updateTagParam = (nextTag?: string) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextTag) {
      nextParams.set('tag', nextTag);
    } else {
      nextParams.delete('tag');
    }

    setSearchParams(nextParams);
  };

  // 标签筛选页（?tag=xxx）为可索引内容页（canonical 自指保留 tag 参数），
  // 输出独立的 title/description，避免所有标签筛选页共用「标签」这一泛化标题。
  // 注意：此处只传页面名，Seo 组件统一拼「页面名 - 站点名」，避免重复。
  const tagsPageDescription =
    '跑路的duck 标签导航页，按主题标签筛选全部文章，快速定位前端开发、后端运维、AI 工具与效率软件等感兴趣内容。';
  const seoTitle = selectedTag && selectedTagInfo ? `标签：${selectedTag}` : '标签';
  const seoDescription =
    selectedTag && selectedTagInfo
      ? `跑路的duck 标签「${selectedTag}」下的全部文章，共 ${selectedTagInfo.count} 篇，涵盖前端开发、后端运维、AI 工具与效率软件测评等主题。`
      : tagsPageDescription;

  // 站点级 schema 与页面级 CollectionPage / ItemList（枚举各 /tags?tag= 筛选页 URL，
  // 帮助爬虫发现子页）/ BreadcrumbList 一并输出，SSG 静态页不再重复注入。
  const tagsStructuredData = [
    ...buildSiteSchemas(seoDescription),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `标签 | ${siteConfig.title}`,
      description: tagsPageDescription,
      url: absoluteSiteUrl('/tags', siteConfig.url),
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteConfig.title,
        url: absoluteSiteUrl('/', siteConfig.url),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: '标签列表',
      url: absoluteSiteUrl('/tags', siteConfig.url),
      itemListElement: allTags.map((tag, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tag.name,
        url: absoluteSiteUrl(`/tags?tag=${encodeURIComponent(tag.name)}`, siteConfig.url),
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteSiteUrl('/', siteConfig.url) },
        ...(selectedTag && selectedTagInfo
          ? [
              { '@type': 'ListItem', position: 2, name: '标签', item: absoluteSiteUrl('/tags', siteConfig.url) },
              {
                '@type': 'ListItem',
                position: 3,
                name: selectedTag,
                item: absoluteSiteUrl(`/tags?tag=${encodeURIComponent(selectedTag)}`, siteConfig.url),
              },
            ]
          : [{ '@type': 'ListItem', position: 2, name: '标签', item: absoluteSiteUrl('/tags', siteConfig.url) }]),
      ],
    },
  ];

  // 选中标签时的篇数：有搜索词时按「当前搜索结果里仍属于该标签的文章」计数，
  // 与下方列表同源（保持原有语义）。
  const selectedPostCount = hasSearchQuery ? filteredSelectedTagPosts.length : (selectedTagInfo?.count ?? 0);

  return (
    <div className="pb-8 md:pb-14">
      <Seo title={seoTitle} description={seoDescription} structuredData={tagsStructuredData} />

      {/* 编辑式页头：去掉英文大写眉题与重边框，标题 + 右侧统计，一条发丝线收尾 */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-5 md:pb-6">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-content md:text-4xl">标签集合</h1>
        <p className="text-sm tabular-nums text-content-muted">
          共 {allTags.length} 个标签 · {allTags.reduce((sum, tag) => sum + tag.count, 0)} 篇文章
        </p>
      </header>

      {/* 搜索框保持在条件渲染之外：搜索进行中（防抖/评分）输入框不随结果区一起卸载，
          避免用户无法继续输入或修改关键词。 */}
      <div className="mb-8 mt-7 md:mt-9">
        <SearchField
          value={searchQuery}
          onValueChange={handleSearchChange}
          onClear={handleClearSearch}
          placeholder="搜索标签或文章..."
          containerClassName="max-w-md"
          aria-label="搜索标签或文章"
        />
        {hasSearchQuery && (
          <p className="mt-3 text-sm text-content-muted">
            “<span className="font-semibold text-content">{searchQuery}</span>” · 找到 {tags.length} 个标签
          </p>
        )}
      </div>

      {loading || isSearching ? (
        <div className="flex items-center justify-center py-16" aria-busy="true">
          <LoadingStatus label={isSearching ? '正在搜索标签和文章' : '正在加载标签'} />
        </div>
      ) : loadError || searchError ? (
        <ContentStatus
          variant="error"
          title={loadError ? '标签加载失败' : '搜索失败'}
          description={loadError || searchError || undefined}
          actionLabel={loadError ? '重新加载' : '清除搜索'}
          onAction={loadError ? () => setLoadAttempt((attempt) => attempt + 1) : handleClearSearch}
        />
      ) : !selectedTag ? (
        tags.length > 0 ? (
          /* 标签云：只靠字号/字重/颜色分层，靠留白分隔；每项仍是 44px 高的真实点击区，
             保留 aria-label（含文章数）。hover 时下划线 + 文字变深，不做重胶囊/粗下划线。 */
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 sm:gap-x-7 md:gap-x-8">
            {tags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => updateTagParam(tag.name)}
                aria-label={`查看标签 ${tag.name}，共 ${tag.count} 篇文章`}
                className="group inline-flex min-h-11 max-w-full items-center text-left"
              >
                <span className="inline-flex min-w-0 items-baseline gap-1.5">
                  <span
                    className={`min-w-0 break-words decoration-line underline-offset-4 transition-colors [overflow-wrap:anywhere] group-hover:text-content group-hover:underline ${getTagSize(tag.count)}`}
                  >
                    {tag.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-normal tabular-nums text-content-muted">{tag.count}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <ContentStatus
            title={hasSearchQuery ? '未找到匹配标签' : '当前还没有可展示的标签内容。'}
            description={hasSearchQuery ? '尝试缩短关键词，或清除搜索条件后查看全部标签。' : undefined}
            actionLabel={hasSearchQuery ? '清除搜索' : undefined}
            onAction={hasSearchQuery ? handleClearSearch : undefined}
            className="mt-2"
          />
        )
      ) : (
        <div>
          {/* 选中标签：编辑式小标题，返回全部标签降级为文字 ghost 操作（保持 type="button"） */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:mb-8">
            <div className="min-w-0">
              <p className="text-xs font-medium text-content-muted">标签</p>
              <h2 className="mt-1.5 break-words font-serif text-2xl font-bold tracking-tight text-content [overflow-wrap:anywhere] md:text-3xl">
                {selectedTag}
                <span className="ml-2.5 align-baseline font-sans text-sm font-normal tabular-nums text-content-muted">
                  共 {selectedPostCount} 篇
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={() => updateTagParam()}
              className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-content-muted transition-colors hover:text-content"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              返回全部标签
            </button>
          </div>

          {/* 文章列表：标题 + 摘要 + 日期/阅读时长，发丝线分隔；去掉分类胶囊与重边框 */}
          <div className="border-t border-line" aria-live="polite">
            {filteredSelectedTagPosts.map((post) => (
              <div key={post.id} className="border-b border-line">
                <Link
                  to={`/post/${post.id}`}
                  className="group grid min-w-0 gap-x-6 gap-y-2 py-5 transition-colors md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline md:py-6"
                >
                  <div className="min-w-0">
                    <h3 className="min-w-0 break-words text-lg font-semibold leading-snug tracking-tight text-content decoration-line underline-offset-4 transition-colors [overflow-wrap:anywhere] group-hover:underline md:text-xl">
                      {post.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-content-muted [overflow-wrap:anywhere]">
                      {post.excerpt}
                    </p>
                  </div>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-content-muted md:justify-end md:whitespace-nowrap">
                    <time dateTime={post.date}>{post.date}</time>
                    <span aria-hidden="true" className="opacity-60">
                      ·
                    </span>
                    <span>{post.readTime}</span>
                  </p>
                </Link>
              </div>
            ))}

            {selectedTagInfo && filteredSelectedTagPosts.length === 0 && (
              <p className="border-b border-line py-6 text-sm text-content-muted">
                当前标签存在，但在当前搜索条件下没有匹配文章。你可以清除搜索后查看完整列表。
              </p>
            )}

            {!selectedTagInfo && (
              <p className="border-b border-line py-6 text-sm text-content-muted">
                当前标签不存在或已失效，请返回查看全部标签。
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
