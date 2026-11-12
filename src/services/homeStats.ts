/**
 * 首页小部件的构建期统计：文章数、累计字数、写作档案（近 12 个月柱状图）、
 * 热门标签与推荐阅读。
 *
 * 全部来自构建期内联的 `generated/posts.json`，**不读时钟、不读随机值、不发请求**：
 * 「近 12 个月」与「本年」都以**最新一篇文章的日期**为锚点（数据字段），
 * 而不是 `Date.now()` —— 否则 SSG 产物会随构建时刻漂移，水合首帧也对不上。
 * 锚点年份/月份在 UI 上显式写出（如「2026 年」），不假装是「今年」。
 */

import type { PostMetadata } from '@/types';
import { getInitialPosts } from '@/services/posts';
import { getDateTimestamp } from '@/utils/date';

/** 写作档案柱状图的月份数（含锚点月，向左回看）。 */
export const HOME_MONTH_BUCKETS = 12;
/** 首页标签云的标签数上限。 */
const HOME_TAG_LIMIT = 8;
/** 推荐阅读卡片的篇数。 */
const HOME_FEATURED_LIMIT = 3;

export interface HomeMonthBucket {
  /** `${year}-${month}`，月份补零。 */
  key: string;
  /** 柱状图横轴标签，如「9月」。 */
  label: string;
  /** 横轴的完整可读名称，如「2026年9月」。 */
  fullLabel: string;
  count: number;
}

export interface HomeTag {
  name: string;
  count: number;
}

export interface HomeStats {
  /** 文章总数。 */
  postCount: number;
  /** 累计字数（`wordCount` 之和）。 */
  totalWords: number;
  /** 锚点年份：最新一篇文章的发表年。 */
  anchorYear: number | null;
  /** 锚点月份：最新一篇文章的发表月（1-12）。 */
  anchorMonth: number | null;
  /** 锚点年份内的文章数。 */
  yearPostCount: number;
  /** 最早一篇文章的日期（YYYY-MM-DD），无文章时为 null。 */
  firstPostDate: string | null;
  /** 近 12 个月（旧 → 新）每月发表篇数。 */
  months: HomeMonthBucket[];
  /** 按文章数降序的标签（最多 8 个）。 */
  tags: HomeTag[];
  /** 去重后的标签总数（标签云只展示前 8 个，这里给出总数）。 */
  tagCount: number;
  /** 推荐阅读：按 `updatedAt || date` 降序的前 3 篇。 */
  featuredPosts: PostMetadata[];
}

const getPostSortKey = (post: PostMetadata) => post.updatedAt || post.date;

/** 解析 "YYYY-MM-DD" 的年月；非法日期返回 null。 */
const parseYearMonth = (dateText: string): { year: number; month: number } | null => {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateText)) {
    return null;
  }
  const [yearText, monthText] = dateText.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
};

const buildMonthBuckets = (posts: PostMetadata[], anchorYear: number, anchorMonth: number): HomeMonthBucket[] => {
  const counts = new Map<string, number>();
  posts.forEach((post) => {
    const parsed = parseYearMonth(post.date);
    if (!parsed) {
      return;
    }
    const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const buckets: HomeMonthBucket[] = [];
  // 从锚点月向左回看 11 个月，最后一格是锚点月本身。
  for (let offset = HOME_MONTH_BUCKETS - 1; offset >= 0; offset -= 1) {
    const zeroBased = anchorYear * 12 + (anchorMonth - 1) - offset;
    const year = Math.floor(zeroBased / 12);
    const month = (zeroBased % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    buckets.push({
      key,
      label: `${month}月`,
      fullLabel: `${year}年${month}月`,
      count: counts.get(key) ?? 0,
    });
  }

  return buckets;
};

/** 从文章元数据汇总标签（去首尾空白、按文章数降序、同数按中文名排序）。 */
const buildTagList = (posts: PostMetadata[]): HomeTag[] => {
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

/** 纯函数：由文章元数据生成首页统计（便于单测直接喂 fixture）。 */
export const buildHomeStats = (posts: PostMetadata[]): HomeStats => {
  const sortedByRecent = posts
    .slice()
    .sort((a, b) => getDateTimestamp(getPostSortKey(b)) - getDateTimestamp(getPostSortKey(a)));

  const datedPosts = posts.filter((post) => parseYearMonth(post.date) !== null);
  const sortedByDateDesc = datedPosts.slice().sort((a, b) => getDateTimestamp(b.date) - getDateTimestamp(a.date));
  const sortedByDateAsc = datedPosts.slice().sort((a, b) => getDateTimestamp(a.date) - getDateTimestamp(b.date));

  const anchor = sortedByDateDesc.length > 0 ? parseYearMonth(sortedByDateDesc[0].date) : null;

  const totalWords = posts.reduce((sum, post) => sum + (Number(post.wordCount) || 0), 0);

  const yearPostCount =
    anchor === null ? 0 : datedPosts.filter((post) => parseYearMonth(post.date)?.year === anchor.year).length;

  const allTags = buildTagList(posts);

  return {
    postCount: posts.length,
    totalWords,
    anchorYear: anchor?.year ?? null,
    anchorMonth: anchor?.month ?? null,
    yearPostCount,
    firstPostDate: sortedByDateAsc[0]?.date ?? null,
    months: anchor ? buildMonthBuckets(datedPosts, anchor.year, anchor.month) : [],
    tags: allTags.slice(0, HOME_TAG_LIMIT),
    tagCount: allTags.length,
    featuredPosts: sortedByRecent.slice(0, HOME_FEATURED_LIMIT),
  };
};

// 构建期数据是常量，首次渲染算一次即可；避免每次渲染重排文章元数据。
let cachedHomeStats: HomeStats | null = null;

/** 读取首页统计（模块级缓存，SSG 与客户端水合读同一份构建期数据）。 */
export const getHomeStats = (): HomeStats => {
  if (!cachedHomeStats) {
    cachedHomeStats = buildHomeStats(getInitialPosts());
  }
  return cachedHomeStats;
};
