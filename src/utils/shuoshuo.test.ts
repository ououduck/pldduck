import { describe, it, expect } from 'vitest';
import { SHUOSHUO_LIST_PATH, shuoshuoPath, buildShuoShuoDescription } from './shuoshuo';

describe('shuoshuoPath', () => {
  it('拼出列表页与详情页路径', () => {
    expect(SHUOSHUO_LIST_PATH).toBe('/shuoshuo');
    expect(shuoshuoPath('hello-shuoshuo')).toBe('/shuoshuo/hello-shuoshuo');
  });

  it('对标识做 URL 编码（历史标识可能含特殊字符）', () => {
    expect(shuoshuoPath('a b')).toBe('/shuoshuo/a%20b');
  });
});

describe('buildShuoShuoDescription', () => {
  const base = { authorName: '跑路的duck', date: '2026-08-15', siteTitle: '跑路的duck' };

  it('短内容补齐到 SEO 审计下限（50 字），不超上限', () => {
    const description = buildShuoShuoDescription({ ...base, excerpt: '恐怖' });
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).toContain('恐怖');
    expect(description).toContain('2026-08-15');
  });

  it('长内容截断到 120 字并加省略号', () => {
    const description = buildShuoShuoDescription({ ...base, excerpt: '啊'.repeat(300) });
    expect(description).toContain('…');
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('空内容仍给出可用的描述', () => {
    const description = buildShuoShuoDescription({ ...base, excerpt: '' });
    expect(description).toContain('发布的一条说说');
    expect(description.length).toBeGreaterThanOrEqual(50);
  });

  it('纯函数：同样输入永远得到同样输出（SSG 与水合一致）', () => {
    const input = { ...base, excerpt: '首页新改版' };
    expect(buildShuoShuoDescription(input)).toBe(buildShuoShuoDescription(input));
  });
});
