// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validatePostContent } from './post-content-validator.mjs';

const makePost = (content) => ({
  data: { title: '测试文章', excerpt: '摘要', tags: [], date: '2026-01-01' },
  id: 'test-post',
  content,
  filePath: '/posts/test-post.md',
});

// 说说改由 giscus 承载后，/shuoshuo/<id> 详情路由退役为 301；
// 内容校验不再关心「目标说说是否存在」，任何 /shuoshuo/<id> 视为未知站内路由。
describe('validatePostContent — /shuoshuo 链接的站内路由校验', () => {
  it('链接到 /shuoshuo 集合页（静态路由）：不报错', () => {
    const errors = validatePostContent(makePost('[全部说说](/shuoshuo)'), {
      skipFrontMatter: true,
    });
    expect(errors).toEqual([]);
  });

  it('链接到 /shuoshuo/<id>（已退役的详情路由）：报 unknown site route', () => {
    const errors = validatePostContent(makePost('[一条说说](/shuoshuo/hello)'), {
      skipFrontMatter: true,
    });
    expect(errors.some((message) => message.includes('unknown site route'))).toBe(true);
  });
});
