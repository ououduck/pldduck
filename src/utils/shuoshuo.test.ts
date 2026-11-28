import { describe, it, expect } from 'vitest';
import {
  SHUOSHUO_LIST_PATH,
  SHUOSHUO_PER_PAGE,
  shuoshuoPageCount,
  shuoshuoPagePath,
  buildShuoShuoDescription,
} from './shuoshuo';

describe('说说分页口径', () => {
  it('每页 10 条，第 1 页即列表页本身', () => {
    expect(SHUOSHUO_PER_PAGE).toBe(10);
    expect(SHUOSHUO_LIST_PATH).toBe('/shuoshuo');
    expect(shuoshuoPagePath(1)).toBe('/shuoshuo');
    expect(shuoshuoPagePath(2)).toBe('/shuoshuo/page/2');
    expect(shuoshuoPagePath(3)).toBe('/shuoshuo/page/3');
  });

  it('非法页码收敛到第 1 页（不生成奇怪路径）', () => {
    expect(shuoshuoPagePath(0)).toBe('/shuoshuo');
    expect(shuoshuoPagePath(-5)).toBe('/shuoshuo');
    expect(shuoshuoPagePath(Number.NaN)).toBe('/shuoshuo');
    expect(shuoshuoPagePath(2.9)).toBe('/shuoshuo/page/2');
  });

  it('总页数按 10 条向上取整，空列表也算 1 页', () => {
    expect(shuoshuoPageCount(0)).toBe(1);
    expect(shuoshuoPageCount(1)).toBe(1);
    expect(shuoshuoPageCount(10)).toBe(1);
    expect(shuoshuoPageCount(11)).toBe(2);
    expect(shuoshuoPageCount(20)).toBe(2);
    expect(shuoshuoPageCount(21)).toBe(3);
  });
});

describe('buildShuoShuoDescription', () => {
  const base = { siteTitle: '跑路的duck', authorName: '跑路的duck', date: '2026-08-15' };

  it('短内容补齐到 SEO 审计下限（50 字），不超上限', () => {
    const description = buildShuoShuoDescription({ ...base, excerpt: '恐怖' });
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain('恐怖');
  });

  it('长内容截断并加省略号，不超上限', () => {
    const description = buildShuoShuoDescription({ ...base, excerpt: '啊'.repeat(300) });
    expect(description).toContain('…');
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('无内容时仍给出可用描述，并带上分页信息', () => {
    const description = buildShuoShuoDescription({ siteTitle: '跑路的duck', page: 2, totalPages: 3 });
    expect(description).toContain('第 2 / 3 页');
    expect(description.length).toBeGreaterThanOrEqual(50);
  });

  it('分页与日期并进同一对括号，不出现括号连排', () => {
    const description = buildShuoShuoDescription({
      ...base,
      excerpt: '恐怖',
      page: 2,
      totalPages: 2,
    });
    expect(description).toContain('第 2 / 2 页 · 2026-08-15');
    expect(description).not.toContain('页）（');
  });

  it('纯函数：同样输入永远得到同样输出（SSG 与水合一致）', () => {
    const input = { ...base, excerpt: '首页新改版' };
    expect(buildShuoShuoDescription(input)).toBe(buildShuoShuoDescription(input));
  });
});
