import { describe, expect, it } from 'vitest';
import { COMMENT_SURFACES, resolveCommentSurface, loadCommentSurfaceConfig } from './comment-surface.mjs';

/**
 * 2026-11 起说说与留言板改成「一条内容 = 一条 Discussion」（修评论邮件通知），
 * 各条编号不再固定 —— 区域识别改为**按分类名**，旧固定编号只作迁移兜底。
 */
describe('comment-surface', () => {
  it('按分类名识别说说与留言板（一条一帖后编号不再固定）', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 137,
        categoryName: '说说',
        guestbookCategoryName: '留言板',
        shuoshuoCategoryName: '说说',
        articleCategoryName: '文章评论',
      }),
    ).toBe(COMMENT_SURFACES.SHUOSHUO);

    expect(
      resolveCommentSurface({
        discussionNumber: 288,
        categoryName: '留言板',
        guestbookCategoryName: '留言板',
        shuoshuoCategoryName: '说说',
        articleCategoryName: '文章评论',
      }),
    ).toBe(COMMENT_SURFACES.GUESTBOOK);
  });

  it('分类名两端空白不影响判定（GitHub 分类名可能带空格）', () => {
    expect(
      resolveCommentSurface({
        categoryName: ' 说说 ',
        guestbookCategoryName: '留言板',
        shuoshuoCategoryName: '说说',
      }),
    ).toBe(COMMENT_SURFACES.SHUOSHUO);
  });

  it('文章评论按分类名识别，未知 discussion 返回 unknown', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 99,
        categoryName: '文章评论',
        guestbookCategoryName: '留言板',
        shuoshuoCategoryName: '说说',
        articleCategoryName: '文章评论',
      }),
    ).toBe(COMMENT_SURFACES.ARTICLE);

    expect(resolveCommentSurface({ discussionNumber: 99, categoryName: '其他' })).toBe(COMMENT_SURFACES.UNKNOWN);
    // 分类名缺失且没有旧编号：不能瞎猜成文章评论。
    expect(resolveCommentSurface({ discussionNumber: 99 })).toBe(COMMENT_SURFACES.UNKNOWN);
  });

  it('迁移兜底：旧的固定编号（合集讨论）仍能识别', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 4,
        categoryName: 'Announcements',
        guestbookDiscussionId: 2,
        shuoshuoDiscussionId: 4,
        shuoshuoCategoryName: '说说',
        guestbookCategoryName: '留言板',
      }),
    ).toBe(COMMENT_SURFACES.SHUOSHUO);
    expect(
      resolveCommentSurface({
        discussionNumber: '2',
        categoryName: '',
        guestbookDiscussionId: 2,
        shuoshuoDiscussionId: 4,
      }),
    ).toBe(COMMENT_SURFACES.GUESTBOOK);
  });

  it('分类名与旧编号冲突时以分类名为准（迁移后编号会复用到别的分类）', () => {
    expect(
      resolveCommentSurface({
        discussionNumber: 4,
        categoryName: '留言板',
        guestbookCategoryName: '留言板',
        shuoshuoCategoryName: '说说',
        // 旧配置里 4 曾被记作说说：不能赢过真实的分类名。
        shuoshuoDiscussionId: 4,
      }),
    ).toBe(COMMENT_SURFACES.GUESTBOOK);
  });

  it('读取 comments.config.json 的区域映射（分类名 + 分类 ID）', () => {
    const config = loadCommentSurfaceConfig();
    expect(config?.shuoshuoCategoryName).toBe('说说');
    expect(config?.guestbookCategoryName).toBe('留言板');
    expect(config?.articleCategoryName).toBe('文章评论');
  });

  it('配置缺失/损坏时返回 null，不阻断审核', () => {
    expect(loadCommentSurfaceConfig('C:/definitely-missing/comments.config.json')).toBeNull();
  });
});
