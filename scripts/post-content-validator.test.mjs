// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validatePostContent } from './post-content-validator.mjs';

const makePost = (content) => ({
  data: { title: '测试文章', excerpt: '摘要', tags: [], date: '2026-01-01' },
  id: 'test-post',
  content,
  filePath: '/posts/test-post.md',
});

// 2026-11 起说说内容回到 shuoshuo/*.md，详情页是 /shuoshuo/<id>（id 为 ASCII 标识）。
// 内容校验做两件事：路径形状合法 + 目标说说真实存在（调用方传 shuoshuoIds）。
describe('validatePostContent — 说说链接的站内路由校验', () => {
  it('链接到列表页（静态路由）：不报错', () => {
    expect(validatePostContent(makePost('[全部说说](/shuoshuo)'), { skipFrontMatter: true })).toEqual([]);
  });

  it('链接到存在的说说详情页：不报错', () => {
    expect(
      validatePostContent(makePost('[一条说说](/shuoshuo/hello-shuoshuo)'), {
        skipFrontMatter: true,
        shuoshuoIds: new Set(['hello-shuoshuo']),
      }),
    ).toEqual([]);
  });

  it('链接到不存在的说说详情页：报 missing shuoshuo entry', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/missing-entry)'), {
      skipFrontMatter: true,
      shuoshuoIds: new Set(['hello-shuoshuo']),
    });
    expect(errors.some((message) => message.includes('missing shuoshuo entry'))).toBe(true);
  });

  it('已下线的留言板路径：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[留言板](/guestbook)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
    const detailErrors = validatePostContent(makePost('[一份留言](/guestbook/288)'), { skipFrontMatter: true });
    expect(detailErrors.some((message) => message.includes('unknown site route'))).toBe(true);
  });

  it('说说详情页标识超出安全字符集：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/hello%2Fworld)'), { skipFrontMatter: true });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
  });
});
