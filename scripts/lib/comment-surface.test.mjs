import { describe, expect, it } from 'vitest';
import { COMMENT_SURFACES, resolveCommentSurface, loadCommentSurfaceConfig } from './comment-surface.mjs';

/**
 * 站内评论只剩文章评论区（说说与留言板评论区已于 2026-11 下线），
 * 区域识别因此只区分「文章评论」与「非本站评论区」。
 */
describe('comment-surface', () => {
  it('文章评论按分类名识别', () => {
    expect(resolveCommentSurface({ categoryName: '文章评论', articleCategoryName: '文章评论' })).toBe(
      COMMENT_SURFACES.ARTICLE,
    );
  });

  it('分类名两端空白不影响判定（GitHub 分类名可能带空格）', () => {
    expect(resolveCommentSurface({ categoryName: ' 文章评论 ', articleCategoryName: '文章评论' })).toBe(
      COMMENT_SURFACES.ARTICLE,
    );
  });

  it('已下线区域与未知分类一律返回 unknown（不再做任何处理）', () => {
    expect(resolveCommentSurface({ categoryName: '说说', articleCategoryName: '文章评论' })).toBe(
      COMMENT_SURFACES.UNKNOWN,
    );
    expect(resolveCommentSurface({ categoryName: '留言板', articleCategoryName: '文章评论' })).toBe(
      COMMENT_SURFACES.UNKNOWN,
    );
    expect(resolveCommentSurface({ categoryName: '其他' })).toBe(COMMENT_SURFACES.UNKNOWN);
    // 分类名缺失：不能瞎猜成文章评论。
    expect(resolveCommentSurface({})).toBe(COMMENT_SURFACES.UNKNOWN);
  });

  it('读取 comments.config.json 的文章评论分类名', () => {
    const config = loadCommentSurfaceConfig();
    expect(config?.articleCategoryName).toBe('文章评论');
  });

  it('配置缺失/损坏时返回 null，不阻断审核', () => {
    expect(loadCommentSurfaceConfig('C:/definitely-missing/comments.config.json')).toBeNull();
  });
});
