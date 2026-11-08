/**
 * 评论所属站内区域识别。
 *
 * 文章评论、留言板与说说共用 GitHub Discussions 承载，审核脚本
 * （Akismet / 关键词过滤 / 全量复查 / 飞书通知）都按 discussion 维度处理。
 * 这里把「Discussion 编号 + 分类名」归一成稳定的 surface 值，便于：
 *   1. 日志/审计明确显示说说评论也进入了审核链路；
 *   2. 后续按区域配置不同处理策略时不至于靠散落的数字判断。
 *
 * 注意：该函数只做识别，不负责豁免/删除；审核动作仍由各脚本决定。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/comments.config.json',
);

export const COMMENT_SURFACES = Object.freeze({
  ARTICLE: 'article',
  GUESTBOOK: 'guestbook',
  SHUOSHUO: 'shuoshuo',
  UNKNOWN: 'unknown',
});

/**
 * @param {object} input
 * @param {number|string} [input.discussionNumber] GitHub Discussion 的 number。
 * @param {string} [input.categoryName] Discussion 所属分类名。
 * @param {number|string} [input.guestbookDiscussionId] comments.config.json 的 guestbook.discussionId。
 * @param {number|string} [input.shuoshuoDiscussionId] comments.config.json 的 shuoshuo.discussionId。
 * @param {string} [input.articleCategoryName] 文章评论分类名，默认「文章评论」。
 * @returns {'article'|'guestbook'|'shuoshuo'|'unknown'}
 */
export const resolveCommentSurface = ({
  discussionNumber,
  categoryName,
  guestbookDiscussionId,
  shuoshuoDiscussionId,
  articleCategoryName = '文章评论',
} = {}) => {
  const number = Number(discussionNumber);
  if (Number.isFinite(number)) {
    if (Number.isFinite(Number(shuoshuoDiscussionId)) && number === Number(shuoshuoDiscussionId)) {
      return COMMENT_SURFACES.SHUOSHUO;
    }
    if (Number.isFinite(Number(guestbookDiscussionId)) && number === Number(guestbookDiscussionId)) {
      return COMMENT_SURFACES.GUESTBOOK;
    }
  }

  if (articleCategoryName && categoryName === articleCategoryName) {
    return COMMENT_SURFACES.ARTICLE;
  }

  return COMMENT_SURFACES.UNKNOWN;
};

/**
 * 读取评论区域配置；文件缺失/损坏时返回 null，让审核脚本按 unknown 兜底处理，
 * 不因为展示层配置问题阻断反垃圾链路。
 * @param {string} [filePath]
 * @returns {{ guestbookDiscussionId?: number|string, shuoshuoDiscussionId?: number|string, articleCategoryName?: string } | null}
 */
export const loadCommentSurfaceConfig = (filePath = DEFAULT_CONFIG_PATH) => {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      guestbookDiscussionId: raw?.guestbook?.discussionId,
      shuoshuoDiscussionId: raw?.shuoshuo?.discussionId,
      articleCategoryName: raw?.comments?.category || '文章评论',
    };
  } catch {
    return null;
  }
};
