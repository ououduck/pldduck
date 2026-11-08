/**
 * 文章页：精选/最新文章网格、站内搜索、分类/排序/分页筛选与继续阅读。
 * 首页（/）只做导流，文章列表的全部交互集中在这里。
 */
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronRight, X } from 'lucide-react';
import { SearchField } from '@/components/SearchField';
import { getInitialPosts, getPosts } from '@/services/posts';
import type { PostMetadata } from '../types';
import { siteConfig } from '@config/site.config';
import { Seo } from '../components/Seo';
import { PostCard } from '@/components/PostCard';
import { usePostSearch } from '@/hooks/usePostSearch';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useScrollEdgeFade } from '@/hooks/useScrollEdgeFade';
import { mergeClassName } from '@/utils/classNames';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { TagsPanel, type TagSummary } from '@/components/TagsPanel';
import { sortPosts } from '@/utils/postSorting';
import { getHeroPost } from '@/utils/postSelection';
import { useReadingHistory } from '@/hooks/useReadingHistory';
import { removeReadingHistory } from '@/services/readingHistory';
import { isReadingComplete } from '@/utils/readingProgress';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Pagination } from '@/components/Pagination';
import { canonicalizeHomeQuery, getHomeQueryState, setHomeQueryParam } from '@/utils/homeQuery';
import { clearSearchQueryParams, setSearchQueryParams } from '@/utils/searchParams';

const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));

const ALL_CATEGORY = '全部';
/** 与导航项「文章」同字，但不从 Layout 引入（那是组件私有常量）。 */
const PAGE_TITLE = '文章';
// 列表页自己的 description：不复用 siteConfig.description（那是首页的），
// 两个 URL 共用同一句描述在搜索结果里会被判为软重复。
const PAGE_DESCRIPTION =
  '跑路的duck 的全部文章列表，按时间倒序排列，支持分类筛选、关键词搜索与分页浏览，涵盖前端开发、后端运维、AI 工具与效率软件测评。';
// 分页与精选槽位固定为常量（不随视口变化）：SSR 与客户端水合后首帧完全一致，
// 避免媒体查询导致的文章数/布局重排（CLS）。网格列数由 Tailwind 响应式类原生控制。
const POSTS_PER_PAGE = 9;
const HERO_SLOTS = 3;
const initialPosts = getInitialPosts();

/** 列表与骨架屏共用同一套竖向节奏，避免加载前后行距跳动。 */
const POSTS_LIST_CLASS = 'flex flex-col gap-5';

const getCategories = (posts: PostMetadata[]) => Array.from(new Set(posts.map((post) => post.category)));

/** 从文章元数据汇总标签（去首尾空白、按文章数降序、同数按中文名排序）。 */
const buildTagList = (posts: PostMetadata[]): TagSummary[] => {
  const tagMap = new Map<string, number>();

  posts.forEach((post) => {
    (Array.isArray(post.tags) ? post.tags : [])
      .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
      .filter(Boolean)
      .forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      });
  });

  return Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
};

const SkeletonBlock: React.FC<{ className?: string; shouldReduceMotion: boolean }> = ({
  className,
  shouldReduceMotion,
}) => (
  <div className={`bg-zinc-200 dark:bg-zinc-700 ${shouldReduceMotion ? '' : 'animate-pulse'} ${className || ''}`} />
);

const FeaturedPostSkeleton: React.FC<{ shouldReduceMotion: boolean }> = ({ shouldReduceMotion }) => (
  <div aria-hidden="true" className="overflow-hidden rounded-overlay bg-surface-muted">
    <div className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] sm:grid-cols-[minmax(0,34%)_minmax(0,1fr)]">
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="min-h-44 sm:min-h-52" />
      <div className="flex min-w-0 flex-col p-4 sm:p-5 md:p-6">
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-24" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-3 h-7 w-4/5" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-3 h-3 w-full" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-1.5 h-3 w-2/3" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-6 h-3 w-32" />
      </div>
    </div>
  </div>
);

const PostCardSkeleton: React.FC<{ shouldReduceMotion: boolean }> = ({ shouldReduceMotion }) => (
  <div aria-hidden="true" className="overflow-hidden rounded-overlay bg-surface-muted">
    <div className="grid grid-cols-[minmax(0,38%)_minmax(0,1fr)] sm:grid-cols-[minmax(0,34%)_minmax(0,1fr)]">
      <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="min-h-44 sm:min-h-52" />
      <div className="flex min-w-0 flex-col p-4 sm:p-5 md:p-6">
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-16" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-2.5 h-5 w-4/5" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-2 h-3 w-full" />
        <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="mt-1.5 h-3 w-2/3" />
        <div className="mt-auto flex items-center justify-between pt-4">
          <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-3 w-28" />
          <SkeletonBlock shouldReduceMotion={shouldReduceMotion} className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </div>
  </div>
);

const LoadingGrid: React.FC<{ heroSlots: number; label: string; hasFeatured: boolean }> = ({
  heroSlots,
  label,
  hasFeatured,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const featuredSlots = hasFeatured ? heroSlots : 0;
  const regularSkeletonCount = Math.max(0, POSTS_PER_PAGE - featuredSlots);

  return (
    <div className={POSTS_LIST_CLASS} aria-busy="true">
      <LoadingStatus label={label} />
      {hasFeatured && <FeaturedPostSkeleton shouldReduceMotion={shouldReduceMotion} />}
      {Array.from({ length: regularSkeletonCount }).map((_, index) => (
        <PostCardSkeleton key={index} shouldReduceMotion={shouldReduceMotion} />
      ))}
    </div>
  );
};

const filterAndSortPosts = (
  posts: PostMetadata[],
  selectedCategory: string,
  selectedTag: string | null,
  sortOrder: 'newest' | 'oldest',
) => {
  let filteredPosts =
    selectedCategory === ALL_CATEGORY ? posts : posts.filter((post) => post.category === selectedCategory);

  if (selectedTag) {
    filteredPosts = filteredPosts.filter((post) =>
      (Array.isArray(post.tags) ? post.tags : []).some((tag) => tag.trim() === selectedTag),
    );
  }

  return sortPosts(filteredPosts, sortOrder);
};

interface FilterBarProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  sortOrder: 'newest' | 'oldest';
  onToggleSort: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ categories, selected, onSelect, sortOrder, onToggleSort }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { fadeStart, fadeEnd } = useScrollEdgeFade(scrollerRef);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 sm:gap-4">
      <div
        ref={scrollerRef}
        className={mergeClassName(
          'filter-scroll-mask min-w-0 flex-1 overflow-x-auto overscroll-x-contain scroll-smooth no-scrollbar',
          fadeStart && 'filter-scroll-mask-start',
          fadeEnd && 'filter-scroll-mask-end',
        )}
      >
        <div className="flex items-center gap-0.5 sm:gap-1" role="group" aria-label="文章分类筛选">
          {[ALL_CATEGORY, ...categories].map((category) => (
            <button
              key={category}
              onClick={() => onSelect(category)}
              aria-pressed={selected === category}
              className={`min-h-11 whitespace-nowrap px-2 text-sm font-medium transition-colors duration-150 ${
                selected === category
                  ? 'text-ink underline decoration-1 underline-offset-8 dark:text-white'
                  : 'text-zinc-500 hover:text-ink dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* 排序收成一个轻量切换按钮：图标 + 当前排序词，aria-pressed 跟随「最早优先」态。 */}
      <button
        type="button"
        onClick={onToggleSort}
        aria-pressed={sortOrder === 'oldest'}
        aria-label={`按${sortOrder === 'newest' ? '最新' : '最早'}优先排序`}
        title="切换排序方式"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm text-zinc-500 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-white dark:focus-visible:outline-zinc-100"
      >
        {sortOrder === 'newest' ? (
          <ArrowDownWideNarrow size={15} aria-hidden="true" />
        ) : (
          <ArrowUpWideNarrow size={15} aria-hidden="true" />
        )}
        <span>{sortOrder === 'newest' ? '最新' : '最早'}</span>
      </button>
    </div>
  );
};

export const Posts = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get('category');
  const tagFromUrl = (searchParams.get('tag') || '').trim();
  const queryFromUrl = searchParams.get('q') || '';
  // 用户最近一次通过输入框编辑的查询值：用于区分「URL 更新还在 startTransition
  // 延迟中」与「URL 确实来自导航（直访 ?q= / 浏览器前进后退）」。见下方同步 effect。
  const lastEditedQueryRef = useRef<string | null>(null);
  // 已处理过的 loadAttempt：防「重新加载成功 → length 变化 → 重复 fetch」。
  const handledLoadAttemptRef = useRef(-1);
  const homeQueryState = useMemo(() => getHomeQueryState(searchParams), [searchParams]);
  const [allPosts, setAllPosts] = useState<PostMetadata[]>(initialPosts);
  const [categories, setCategories] = useState<string[]>(() => getCategories(initialPosts));
  // 分类/排序/页码一律以默认值作为初始 state（SSG 预渲染的是无参首页，
  // 首帧用默认值可保证带参直访时客户端首帧与服务端 HTML 一致，水合无冲突）；
  // URL 中的真实状态由下方 effect 在水合后同步（与 ?q= 搜索框的处理一致）。
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sharePost, setSharePost] = useState<PostMetadata | null>(null);
  const { latest: latestReading, refresh: refreshReadingHistory } = useReadingHistory();
  const { searchQuery, isSearching, searchError, results, handleSearch, setSearchQuery, clearSearch, hasSearchQuery } =
    // 不把 URL 的 ?q= 作为 useState 初始值（与 Search 页一致）：SSG 预渲染的是
    // 无 q 的默认界面，首帧用空查询渲染可保证带 q 直访时客户端首帧与服务端
    // HTML 一致（水合无冲突）；下方 effect 在水合后把 queryFromUrl 同步进搜索。
    usePostSearch({
      emptyResults: allPosts,
    });

  const shouldReduceMotion = useReducedMotion();
  // 标签清单来自全量文章（右侧卡片常驻），计数不随搜索/分类变化。
  const allTags = useMemo(() => buildTagList(allPosts), [allPosts]);
  const tagNames = useMemo(() => new Set(allTags.map((tag) => tag.name)), [allTags]);

  useEffect(() => {
    let cancelled = false;

    // 首帧数据已由 getInitialPosts() 同步提供，水合后无需重复异步重取
    // （避免多余的一次全列表重渲染与 loading 态闪烁）；仅“重新加载”
    // （loadAttempt > 0）或初始数据缺失时才走异步加载。
    if (loadAttempt === 0 && allPosts.length > 0) {
      return () => {
        cancelled = true;
      };
    }
    // 同一 loadAttempt 只发起一次请求：重新加载成功后 allPosts.length 变化
    // 会再次触发本 effect（依赖数组含 length），若不拦截会重复 fetch 并闪烁
    // loading 态；loadAttempt 递增（新的重试/重载）时正常放行。
    if (handledLoadAttemptRef.current === loadAttempt) {
      return () => {
        cancelled = true;
      };
    }
    handledLoadAttemptRef.current = loadAttempt;

    const loadHomeData = async () => {
      setLoading(true);
      try {
        const posts = await getPosts();
        if (cancelled) {
          return;
        }

        setAllPosts(posts);
        setCategories(getCategories(posts));
        setLoadError(null);
      } catch (error) {
        console.error('首页数据加载失败:', error);
        if (!cancelled) {
          setLoadError('文章列表加载失败，请稍后刷新重试。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [allPosts.length, loadAttempt]);

  useEffect(() => {
    const canonicalParams = canonicalizeHomeQuery(searchParams);
    if (canonicalParams.toString() !== searchParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }

    setSortOrder(homeQueryState.sortOrder);
    setCurrentPage(homeQueryState.page);
  }, [homeQueryState, searchParams, setSearchParams]);

  useEffect(() => {
    if (!categoryFromUrl) {
      setSelectedCategory(ALL_CATEGORY);
      return;
    }

    if (categories.includes(categoryFromUrl)) {
      setSelectedCategory(categoryFromUrl);
      return;
    }

    if (categories.length > 0) {
      setSearchParams(
        (previous) => {
          const nextParams = new URLSearchParams(previous);
          nextParams.delete('category');
          nextParams.delete('page');
          return nextParams;
        },
        { replace: true },
      );
      setSelectedCategory(ALL_CATEGORY);
    }
  }, [categories, categoryFromUrl, setSearchParams]);

  // URL 中的 tag 同步到状态；非法 tag 清理参数并回到全部标签。
  useEffect(() => {
    const nextTag = tagFromUrl && tagNames.has(tagFromUrl) ? tagFromUrl : null;

    if (tagFromUrl && !nextTag && tagNames.size > 0) {
      setSearchParams(
        (previous) => {
          const nextParams = new URLSearchParams(previous);
          nextParams.delete('tag');
          nextParams.delete('page');
          return nextParams;
        },
        { replace: true },
      );
    }

    setSelectedTag(nextTag);
  }, [tagFromUrl, tagNames, setSearchParams]);

  useEffect(() => {
    // 单向同步（URL → 输入框），且仅在「URL 值不是用户最近编辑产生」时生效：
    // 生产路由启用 v7_startTransition 后 setSearchParams 的提交是异步延迟的，
    // 用户击键期间 queryFromUrl 仍是旧值 —— 若此时按 queryFromUrl 回写
    // setSearchQuery，会把刚输入的内容回退掉（输入闪变/丢字），并让 usePostSearch
    // 的空查询分支把结果重置回全量列表。lastEditedQueryRef 与 URL 一致说明
    // 本次编辑已落地（或本来就是导航带来的变化），此时才允许 URL → state 同步。
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

  const displayedPosts = useMemo(
    () => filterAndSortPosts(results, selectedCategory, selectedTag, sortOrder),
    [results, selectedCategory, selectedTag, sortOrder],
  );
  const continueReading = useMemo(() => {
    if (!latestReading || isReadingComplete(latestReading.progress)) return null;
    const matchingPost = allPosts.find((post) => post.id === latestReading.postId);
    return matchingPost ? { post: matchingPost, entry: latestReading } : null;
  }, [allPosts, latestReading]);
  const continueReadingProgress = continueReading ? Math.round(continueReading.entry.progress * 100) : 0;

  useEffect(() => {
    if (latestReading && allPosts.length > 0 && !allPosts.some((post) => post.id === latestReading.postId)) {
      removeReadingHistory(latestReading.postId);
      refreshReadingHistory();
    }
  }, [allPosts, latestReading, refreshReadingHistory]);

  const heroPost = useMemo(() => getHeroPost(displayedPosts), [displayedPosts]);
  const heroSlots = heroPost ? HERO_SLOTS : 0;

  const paginationData = useMemo(() => {
    const totalSlots = displayedPosts.reduce((total, post) => total + (post.id === heroPost?.id ? heroSlots : 1), 0);
    const totalPages = Math.max(1, Math.ceil(totalSlots / POSTS_PER_PAGE));

    return { totalSlots, totalPages };
  }, [displayedPosts, heroPost, heroSlots]);

  const { totalPages } = paginationData;

  useEffect(() => {
    const categoryStateFromUrl =
      categoryFromUrl && categories.includes(categoryFromUrl) ? categoryFromUrl : ALL_CATEGORY;
    const tagStateFromUrl = tagFromUrl && tagNames.has(tagFromUrl) ? tagFromUrl : null;
    const filtersAreSynced =
      selectedCategory === categoryStateFromUrl && selectedTag === tagStateFromUrl && searchQuery === queryFromUrl;
    const initialSearchIsPending = Boolean(queryFromUrl.trim()) && results === allPosts;

    if (loading || isSearching || !filtersAreSynced || initialSearchIsPending || currentPage <= totalPages) {
      return;
    }

    setCurrentPage(totalPages);
    setSearchParams((previous) => setHomeQueryParam(previous, 'page', totalPages), { replace: true });
  }, [
    allPosts,
    categories,
    categoryFromUrl,
    currentPage,
    isSearching,
    loading,
    queryFromUrl,
    results,
    searchQuery,
    selectedCategory,
    selectedTag,
    setSearchParams,
    tagFromUrl,
    tagNames,
    totalPages,
  ]);

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
    setSearchParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);

        if (category === ALL_CATEGORY) {
          nextParams.delete('category');
        } else {
          nextParams.set('category', category);
        }
        nextParams.delete('page');

        return nextParams;
      },
      { replace: true },
    );
  };

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag);
    setCurrentPage(1);
    setSearchParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);

        if (tag) {
          nextParams.set('tag', tag);
        } else {
          nextParams.delete('tag');
        }
        nextParams.delete('page');

        return nextParams;
      },
      { replace: true },
    );
  };

  const handleAbandonReading = () => {
    if (!continueReading) return;
    removeReadingHistory(continueReading.post.id);
    refreshReadingHistory();
  };

  const handleToggleSort = () => {
    const nextSortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
    setSortOrder(nextSortOrder);
    setCurrentPage(1);
    setSearchParams(
      (previous) => {
        const nextParams = setHomeQueryParam(previous, 'sort', nextSortOrder);
        nextParams.delete('page');
        return nextParams;
      },
      { replace: false },
    );
  };

  const handleSearchChange = (query: string) => {
    lastEditedQueryRef.current = query;
    handleSearch(query);
    setCurrentPage(1);
    // 搜索时删除 page 页码：搜索结果的页数与无搜索时不一致，保留会跳到错误页。
    setSearchParams((previous) => setSearchQueryParams(previous, query, ['page']), { replace: true });
  };

  const handleClearSearch = () => {
    lastEditedQueryRef.current = '';
    clearSearch();
    setCurrentPage(1);
    setSearchParams((previous) => clearSearchQueryParams(previous, ['page']), { replace: true });
  };

  const currentPosts = useMemo(() => {
    const pageStart = (currentPage - 1) * POSTS_PER_PAGE;
    const pageEnd = pageStart + POSTS_PER_PAGE;

    const pagedPosts: PostMetadata[] = [];
    let consumedSlots = 0;

    for (const post of displayedPosts) {
      const slots = post.id === heroPost?.id ? heroSlots : 1;
      const nextConsumedSlots = consumedSlots + slots;

      if (nextConsumedSlots <= pageStart) {
        consumedSlots = nextConsumedSlots;
        continue;
      }

      if (consumedSlots >= pageEnd) {
        break;
      }

      pagedPosts.push(post);
      consumedSlots = nextConsumedSlots;
    }

    return pagedPosts;
  }, [currentPage, displayedPosts, heroPost, heroSlots]);

  const paginate = (pageNumber: number) => {
    const nextPage = Math.min(Math.max(1, pageNumber), totalPages);
    setCurrentPage(nextPage);
    setSearchParams((previous) => setHomeQueryParam(previous, 'page', nextPage), { replace: false });
    window.requestAnimationFrame(() => {
      const postsPanel = document.getElementById('posts-panel');
      postsPanel?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth', block: 'start' });
      postsPanel?.focus({ preventScroll: true });
    });
  };

  const featuredPost = useMemo(
    () => (heroPost && currentPosts.some((post) => post.id === heroPost.id) ? heroPost : null),
    [currentPosts, heroPost],
  );
  const hasFeaturedPost = Boolean(featuredPost);
  const remainingPosts = useMemo(
    () => currentPosts.filter((post) => post.id !== heroPost?.id),
    [currentPosts, heroPost],
  );

  // 分类筛选页（?category=xxx）为可索引内容页（robots: index,follow，canonical 自指），
  // 输出独立的 title/description，避免与文章列表默认视图共用同一套标题造成软重复；
  // 无效分类（URL 直接拼写）回退列表默认标题。
  // 只写前缀：站点名后缀由 Seo 组件统一拼接，这里再拼一次会得到「X - 站点名 - 站点名」。
  const activeCategory = categoryFromUrl && categories.includes(categoryFromUrl) ? categoryFromUrl : null;
  const categoryPostCount = activeCategory ? allPosts.filter((post) => post.category === activeCategory).length : 0;
  const activeTag = selectedTag;
  const activeTagCount = activeTag ? (allTags.find((tag) => tag.name === activeTag)?.count ?? 0) : 0;
  // 默认标题刻意不用 siteConfig.title：Seo 组件对等于站点名的 title 会套用首页专属的
  // seoHomeTitle（品牌 + 关键词），/posts 与 / 会得到同一个 title，正是软重复。
  const seoTitle =
    hasSearchQuery && results.length > 0
      ? `搜索：${searchQuery}`
      : activeTag
        ? `标签：${activeTag}`
        : activeCategory
          ? `分类：${activeCategory}`
          : PAGE_TITLE;
  const seoDescription = activeTag
    ? `${siteConfig.title}「${activeTag}」标签下的全部文章（共 ${activeTagCount} 篇），涵盖前端开发、后端运维、AI 工具与效率软件测评等主题。`
    : activeCategory
      ? `${siteConfig.title}「${activeCategory}」分类下的全部文章（共 ${categoryPostCount} 篇），涵盖前端开发、后端运维、AI 工具与效率软件测评等主题。`
      : PAGE_DESCRIPTION;

  return (
    <div className="pb-8 md:pb-12">
      {/* 站内搜索页（?q=xxx）统一 noindex：搜索过滤在客户端执行，静态 HTML 无法
          反映搜索意图；且搜索 URL 空间无限，收录会造成软重复与爬虫资源浪费
          （Google 官方对站内搜索结果页的建议即是不索引）。该 noindex 由 Seo 组件
          根据 URL 中的 q 参数自动输出，无需在此显式传入。 */}
      <Seo title={seoTitle} description={seoDescription} />
      {/* 站点身份与页面名由全站外壳（侧边栏 + 顶栏面包屑）承载，本页不再重复
          输出英雄区；h1 保留给屏幕阅读器与搜索引擎定位页面主题。 */}
      <h1 className="sr-only">{PAGE_TITLE}</h1>

      {continueReading && (
        <section
          className="continue-reading mb-6 rounded-overlay bg-surface-muted p-4 md:mb-8 md:p-5"
          aria-labelledby="continue-reading-heading"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-muted">
                <span id="continue-reading-heading">继续阅读</span>
                <span aria-hidden="true" className="text-line">
                  /
                </span>
                <span className="text-[11px] font-medium normal-case tracking-normal">
                  {continueReading.post.category} · 已阅读 {continueReadingProgress}%
                </span>
              </p>
              <h2 className="mt-0.5 line-clamp-2 text-base font-semibold text-content md:text-lg">
                {continueReading.post.title}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link
                to={`/post/${continueReading.post.id}`}
                state={{ continueReading: true }}
                className="inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-medium text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                aria-label={`继续阅读：${continueReading.post.title}`}
              >
                继续阅读
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={handleAbandonReading}
                className="inline-flex min-h-11 w-11 items-center justify-center text-content-muted transition-colors hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                aria-label={`放弃阅读：${continueReading.post.title}`}
                title="放弃阅读"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface" aria-hidden="true">
            <div className="h-full rounded-full bg-content" style={{ width: `${continueReadingProgress}%` }} />
          </div>
        </section>
      )}

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5 md:space-y-7">
          <FilterBar
            categories={categories}
            selected={selectedCategory}
            onSelect={handleSelectCategory}
            sortOrder={sortOrder}
            onToggleSort={handleToggleSort}
          />

          <div className="mx-auto max-w-2xl">
            <SearchField
              value={searchQuery}
              onValueChange={handleSearchChange}
              onClear={handleClearSearch}
              placeholder="搜索标题、摘要、分类与正文内容..."
              aria-label="搜索文章"
            />
          </div>

          {loading || isSearching ? (
            <LoadingGrid
              heroSlots={heroSlots}
              label={isSearching ? '正在搜索文章' : '正在加载文章列表'}
              hasFeatured={hasFeaturedPost}
            />
          ) : loadError || searchError ? (
            <div>
              <ContentStatus
                variant="error"
                title={loadError ? '文章加载失败' : '搜索失败'}
                description={loadError || searchError || undefined}
                actionLabel={loadError ? '重新加载' : '清除搜索'}
                onAction={loadError ? () => setLoadAttempt((attempt) => attempt + 1) : handleClearSearch}
              />
            </div>
          ) : (
            <div id="posts-panel" className="space-y-5" aria-live="polite" tabIndex={-1}>
              {selectedTag && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm text-content-muted">标签</span>
                  <span className="text-sm font-medium text-content">{selectedTag}</span>
                  <button
                    type="button"
                    onClick={() => handleSelectTag(null)}
                    className="inline-flex min-h-11 items-center text-sm text-content-muted transition-colors hover:text-content hover:underline"
                  >
                    清除标签
                  </button>
                </div>
              )}

              {hasSearchQuery && results.length > 0 && (
                <div className="flex items-center justify-end">
                  <Link
                    to={`/search?q=${encodeURIComponent(searchQuery)}`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-700 dark:hover:text-white"
                  >
                    在搜索页查看全部结果 <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              )}

              <div id="posts-grid" className={POSTS_LIST_CLASS}>
                {featuredPost && (
                  <PostCard
                    key={featuredPost.id}
                    post={featuredPost}
                    featured
                    variant="banner"
                    onShare={setSharePost}
                  />
                )}
                {remainingPosts.length > 0 ? (
                  remainingPosts.map((post) => (
                    <PostCard key={post.id} post={post} variant="banner" onShare={setSharePost} />
                  ))
                ) : !featuredPost ? (
                  <div className="rounded-overlay bg-surface-muted px-6 py-14 text-center">
                    <p className="text-base text-content-muted">
                      {selectedTag
                        ? `没有找到带有「${selectedTag}」标签的文章`
                        : hasSearchQuery
                          ? '未找到匹配的文章'
                          : '暂无相关文章'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                      {selectedTag && (
                        <button
                          onClick={() => handleSelectTag(null)}
                          className="min-h-11 text-sm font-medium text-content-muted transition-colors hover:text-content hover:underline"
                          aria-label="清除标签筛选"
                        >
                          清除标签
                        </button>
                      )}
                      {hasSearchQuery && (
                        <button
                          onClick={handleClearSearch}
                          className="min-h-11 text-sm font-medium text-content-muted transition-colors hover:text-content hover:underline"
                          aria-label="清除搜索条件"
                        >
                          清除搜索条件
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={paginate} />
            </div>
          )}
        </div>

        <TagsPanel
          tags={allTags}
          selectedTag={selectedTag}
          totalPosts={allPosts.length}
          onSelectTag={handleSelectTag}
        />
      </div>

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
