/**
 * 评论所属站内区域识别。
 *
 * 站内评论只剩**文章评论区**（Giscus，按页面路径映射到 GitHub Discussions）。
 * 说说与留言板的评论区已于 2026-11 下线，对应分类不再参与任何审核链路。
 *
 * 本模块保留的唯一职责：把「Discussion 分类名」归一成稳定 surface 值，让审核脚本
 * （Akismet / 关键词过滤 / 全量复查 / 飞书通知）能明确区分「文章评论」与「非本站评论区」。
 * 非文章分类（如仓库里为历史内容保留的其它分类）返回 unknown，审核脚本据此跳过 ——
 * 避免对已下线区域的历史讨论继续做处理。
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
  UNKNOWN: 'unknown',
});

/**
 * @param {object} input
 * @param {string} [input.categoryName] Discussion 所属分类名。
 * @param {string} [input.articleCategoryName] 文章评论分类名，默认「文章评论」。
 * @returns {'article'|'unknown'}
 */
export const resolveCommentSurface = ({ categoryName, articleCategoryName = '文章评论' } = {}) => {
  const category = typeof categoryName === 'string' ? categoryName.trim() : '';
  if (category && articleCategoryName && category === String(articleCategoryName).trim()) {
    return COMMENT_SURFACES.ARTICLE;
  }
  return COMMENT_SURFACES.UNKNOWN;
};

/**
 * 读取评论区域配置；文件缺失/损坏时返回 null，让审核脚本按 unknown 兜底处理，
 * 不因为展示层配置问题阻断反垃圾链路。
 * @param {string} [filePath]
 * @returns {{ articleCategoryName: string } | null}
 */
export const loadCommentSurfaceConfig = (filePath = DEFAULT_CONFIG_PATH) => {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      articleCategoryName: raw?.comments?.category || '文章评论',
    };
  } catch {
    return null;
  }
};
