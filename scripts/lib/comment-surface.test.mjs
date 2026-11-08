import { describe, expect, it } from 'vitest';
import { COMMENT_SURFACES, resolveCommentSurface, loadCommentSurfaceConfig } from './comment-surface.mjs';

describe('comment-surface', () => {
  it('按 discussion 编号识别说说与留言板，优先于分类名', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 4,
        categoryName: '文章评论',
        guestbookDiscussionId: 2,
        shuoshuoDiscussionId: 4,
      }),
    ).toBe(COMMENT_SURFACES.SHUOSHUO);

    expect(
      resolveCommentSurface({
        discussionNumber: '2',
        categoryName: 'Announcements',
        guestbookDiscussionId: 2,
        shuoshuoDiscussionId: 4,
      }),
    ).toBe(COMMENT_SURFACES.GUESTBOOK);
  });

  it('文章评论按分类名识别，未知 discussion 返回 unknown', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 99,
        categoryName: '文章评论',
        guestbookDiscussionId: 2,
        shuoshuoDiscussionId: 4,
      }),
    ).toBe(COMMENT_SURFACES.ARTICLE);

    expect(resolveCommentSurface({ discussionNumber: 99, categoryName: '其他' })).toBe(COMMENT_SURFACES.UNKNOWN);
  });

  it('读取 comments.config.json 的区域映射', () => {
    const config = loadCommentSurfaceConfig();
    expect(config?.guestbookDiscussionId).toBe(2);
    expect(config?.shuoshuoDiscussionId).toBe(4);
    expect(config?.articleCategoryName).toBe('文章评论');
  });

  it('配置缺失/损坏时返回 null，不阻断审核', () => {
    expect(loadCommentSurfaceConfig('C:/definitely-missing/comments.config.json')).toBeNull();
  });
});
