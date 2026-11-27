// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validatePostContent } from './post-content-validator.mjs';

const makePost = (content) => ({
  data: { title: '测试文章', excerpt: '摘要', tags: [], date: '2026-01-01' },
  id: 'test-post',
  content,
  filePath: '/posts/test-post.md',
});

// 2026-11 起说说与留言板改成「一条内容 = 一条 Discussion」，每条有独立详情页
// （/shuoshuo/<number>、/guestbook/<number>）。内容校验只认路径形状：
// 数字编号视为合法站内路由，旧自建管线的 slug 深链仍是未知路由。
describe('validatePostContent — 说说/留言链接的站内路由校验', () => {
  it('链接到集合页（静态路由）：不报错', () => {
    expect(validatePostContent(makePost('[全部说说](/shuoshuo)'), { skipFrontMatter: true })).toEqual([]);
    expect(validatePostContent(makePost('[留言板](/guestbook)'), { skipFrontMatter: true })).toEqual([]);
  });

  it('链接到数字编号详情页（新的 per-discussion 路由）：不报错', () => {
    expect(validatePostContent(makePost('[一条说说](/shuoshuo/137)'), { skipFrontMatter: true })).toEqual([]);
    expect(validatePostContent(makePost('[一份留言](/guestbook/288)'), { skipFrontMatter: true })).toEqual([]);
  });

  it('链接到旧自建管线的 slug 深链：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/hello)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
    const guestbookErrors = validatePostContent(makePost('[一份留言](/guestbook/abc)'), { skipFrontMatter: true });
    expect(guestbookErrors.some((message) => message.includes('unknown site route'))).toBe(true);
  });
});
