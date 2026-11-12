import { describe, expect, it } from 'vitest';
import type { PostMetadata } from '@/types';
import { buildHomeStats, getHomeStats, HOME_MONTH_BUCKETS } from './homeStats';

const makePost = (overrides: Partial<PostMetadata> & Pick<PostMetadata, 'id'>): PostMetadata => ({
  title: overrides.title ?? overrides.id,
  excerpt: '',
  date: overrides.date ?? '2026-01-01',
  tags: overrides.tags ?? [],
  category: overrides.category ?? '技术',
  filePath: `/posts/${overrides.id}.md`,
  readTime: '1分钟阅读',
  ...overrides,
});

describe('homeStats', () => {
  it('以最新文章的月份为锚点回看 12 个月，不依赖当前时钟', () => {
    const posts = [
      makePost({ id: 'a', date: '2026-09-25', tags: ['React'], wordCount: 1000 }),
      makePost({ id: 'b', date: '2026-09-01', tags: ['React', 'CSS'], wordCount: 500 }),
      makePost({ id: 'c', date: '2025-12-15', tags: ['CSS'], wordCount: 200 }),
    ];

    const stats = buildHomeStats(posts);

    expect(stats.anchorYear).toBe(2026);
    expect(stats.anchorMonth).toBe(9);
    expect(stats.months).toHaveLength(HOME_MONTH_BUCKETS);
    expect(stats.months[stats.months.length - 1].key).toBe('2026-09');
    expect(stats.months[0].key).toBe('2025-10');
    expect(stats.months.find((month) => month.key === '2026-09')?.count).toBe(2);
    expect(stats.months.find((month) => month.key === '2025-12')?.count).toBe(1);
    expect(stats.months.find((month) => month.key === '2026-01')?.count).toBe(0);

    expect(stats.postCount).toBe(3);
    expect(stats.totalWords).toBe(1700);
    expect(stats.yearPostCount).toBe(2);
    expect(stats.firstPostDate).toBe('2025-12-15');
  });

  it('跨年回看：锚点在 1 月时向前一年的月份也要补齐', () => {
    const stats = buildHomeStats([makePost({ id: 'a', date: '2026-01-08' })]);

    expect(stats.months[0].key).toBe('2025-02');
    expect(stats.months[stats.months.length - 1].key).toBe('2026-01');
  });

  it('标签按文章数降序、同数按中文名排序，最多 8 个', () => {
    const tags = ['React', 'CSS', 'Vite', 'Node', 'TypeScript', 'Rust', 'Go', 'AI', 'DNS', 'SQL'];
    const posts = tags.map((tag, index) =>
      makePost({ id: `post-${index}`, date: `2026-0${(index % 9) + 1}-01`, tags: [tag] }),
    );
    // 让 CSS 出现两次，验证「按文章数降序」优先于名称排序。
    posts.push(makePost({ id: 'extra', date: '2026-03-02', tags: ['CSS'] }));

    const stats = buildHomeStats(posts);

    expect(stats.tags).toHaveLength(8);
    // 卡片只展示前 8 个，但总数如实给出（标签云底部的「共 N 个标签」）。
    expect(stats.tagCount).toBe(10);
    expect(stats.tags[0]).toEqual({ name: 'CSS', count: 2 });
    const counts = stats.tags.map((tag) => tag.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('推荐阅读取 updatedAt || date 降序的前三篇', () => {
    const stats = buildHomeStats([
      makePost({ id: 'old', date: '2026-01-01' }),
      makePost({ id: 'updated', date: '2026-01-02', updatedAt: '2026-09-01' }),
      makePost({ id: 'new', date: '2026-08-01' }),
      makePost({ id: 'mid', date: '2026-05-01' }),
    ]);

    expect(stats.featuredPosts.map((post) => post.id)).toEqual(['updated', 'new', 'mid']);
  });

  it('没有文章时不崩：锚点与月份为空，推荐阅读为空数组', () => {
    const stats = buildHomeStats([]);

    expect(stats.postCount).toBe(0);
    expect(stats.anchorYear).toBeNull();
    expect(stats.firstPostDate).toBeNull();
    expect(stats.months).toEqual([]);
    expect(stats.featuredPosts).toEqual([]);
  });

  it('非法日期不参与月份/年份统计，但文章数与字数仍如实累加', () => {
    const stats = buildHomeStats([
      makePost({ id: 'bad', date: 'not-a-date', wordCount: 100 }),
      makePost({ id: 'good', date: '2026-06-10', wordCount: 50 }),
    ]);

    expect(stats.postCount).toBe(2);
    expect(stats.totalWords).toBe(150);
    expect(stats.anchorMonth).toBe(6);
    expect(stats.months.reduce((sum, month) => sum + month.count, 0)).toBe(1);
  });

  it('getHomeStats 读取构建期数据并缓存同一份结果', () => {
    const first = getHomeStats();
    const second = getHomeStats();

    expect(second).toBe(first);
    expect(first.postCount).toBeGreaterThan(0);
    expect(first.featuredPosts.length).toBeLessThanOrEqual(3);
  });
});
