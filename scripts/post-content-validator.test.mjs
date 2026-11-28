// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validatePostContent } from './post-content-validator.mjs';

const makePost = (content) => ({
  data: { title: '测试文章', excerpt: '摘要', tags: [], date: '2026-01-01' },
  id: 'test-post',
  content,
  filePath: '/posts/test-post.md',
});

// 2026-11 起说说改为「每 10 条一个页面」（/shuoshuo 与 /shuoshuo/page/<n>），
// 逐条 /shuoshuo/<id> 独立页已取消 —— 文章里再写旧格式链接会被拦下。
describe('validatePostContent — 说说链接的站内路由校验', () => {
  it('链接到说说列表页（静态路由）：不报错', () => {
    expect(validatePostContent(makePost('[全部说说](/shuoshuo)'), { skipFrontMatter: true })).toEqual([]);
  });

  it('链接到说说分页（page/<n>）：形状合法，不报错', () => {
    expect(validatePostContent(makePost('[说说第 2 页](/shuoshuo/page/2)'), { skipFrontMatter: true })).toEqual([]);
  });

  it('已取消的逐条说说链接：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/hello-shuoshuo)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
  });

  it('已下线的留言板路径：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[留言板](/guestbook)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
    const detailErrors = validatePostContent(makePost('[一份留言](/guestbook/288)'), { skipFrontMatter: true });
    expect(detailErrors.some((message) => message.includes('unknown site route'))).toBe(true);
  });

  it('分页路径页码不是数字：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[说说分页](/shuoshuo/page/abc)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
  });
});
