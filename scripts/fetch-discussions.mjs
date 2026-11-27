/**
 * fetch-discussions.mjs — 构建期抓取「说说」与「留言板」的 Discussion 列表。
 *
 * 背景（2026-11 用户反馈）：GitHub 的邮件通知是 **Discussion 级**的 —— 谁在某个
 * discussion 里留过言，就会被自动 watch，之后该 discussion 下**每条**评论都会给他
 * 发邮件；GitHub 没有 per-thread / per-reply 订阅可配，giscus 也做不到。
 * 于是留言板与说说从「一个大 Discussion 装全部内容」改为
 * **「一份留言 / 一条说说 = 一个独立 Discussion」**：访客只订阅自己参与的那一份。
 *
 * 因此站内需要「列表 + 详情」两个视图：
 *   - 列表：构建期把两个分类下的 discussion 抓成 `generated/discussions.json`
 *     并 eager 内联，SSG 阶段即可直出（爬虫不执行 JS 也能读到全部内容）；
 *   - 详情：用 giscus 的 `mapping="number"` 精确锁定那一条 discussion（评论仍在 GitHub）。
 *
 * 容错：无 token / API 失败 / 限速 / 分类未配置 一律记录后返回 null，
 * 不阻塞构建（列表页会渲染「暂不可用」占位，而不是让整站构建失败）。
 */

import { pathToFileURL } from 'node:url';
import { loadSiteConfig } from './site-config-loader.mjs';
import { createBuildLogger } from './build-logger.mjs';
import { fetchWithRetry, RetryableHttpError } from './lib/http.mjs';
import { normalizeDiscussionNodes } from '../src/utils/discussion-core.mjs';

const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MS = 15000;
/** 网络瞬时抖动/5xx 的重试次数（不含首次）；限流/权限类错误不重试。 */
const REQUEST_RETRIES = 2;
/** 单分类分页上限（防御）：每页 50，最多 20 页 = 1000 条。 */
const MAX_PAGES = 20;
const DISCUSSIONS_PER_PAGE = 50;

const logger = createBuildLogger('discussions');

/** 每页抓取的字段：列表要展示的都在这里，避免二次请求。
 * 注意：Discussion 类型**没有** isSpam 字段（请求它会整个查询报 undefinedField），
 * 被删除/被标为 spam 的讨论 GraphQL 直接不返回，无需在查询里过滤。 */
const DISCUSSION_FIELDS = `
  number
  title
  body
  createdAt
  updatedAt
  url
  author { login avatarUrl url }
  comments { totalCount }
  reactions { totalCount }
`;

const buildQuery = (perPage) => `query Discussions($owner: String!, $name: String!, $categoryId: ID!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: ${perPage}, after: $cursor, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {${DISCUSSION_FIELDS}}
    }
  }
}`;

/**
 * 抓取一个分类下的全部 discussion。
 * @param {object} options
 * @param {string} options.owner
 * @param {string} options.name
 * @param {string} options.categoryId
 * @param {string} options.token
 * @returns {Promise<object[] | null>} 归一化后的条目；失败返回 null（调用方优雅降级）
 */
const fetchCategoryDiscussions = async ({ owner, name, categoryId, token }) => {
  const query = buildQuery(DISCUSSIONS_PER_PAGE);
  const collected = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let response;
    try {
      response = await fetchWithRetry(
        GRAPHQL_ENDPOINT,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'd-blog-build',
            Accept: 'application/json',
          },
          body: JSON.stringify({ query, variables: { owner, name, categoryId, cursor } }),
        },
        {
          timeoutMs: REQUEST_TIMEOUT_MS,
          retries: REQUEST_RETRIES,
          onRetry: (info) =>
            logger.warn(
              'GitHub GraphQL 请求瞬时失败，重试中',
              `attempt=${info.attempt} status=${info.status ?? 'network'}`,
            ),
        },
      );
    } catch (error) {
      logger.warn(
        '抓取 discussions 失败，列表页将降级',
        error instanceof RetryableHttpError ? `status=${error.status} attempts=${error.attempts}` : String(error),
      );
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      const rateLimited = response.headers.get('x-ratelimit-remaining') === '0';
      logger.warn(`GitHub API 拒绝访问${rateLimited ? '（限速耗尽）' : ''}，列表页将降级`, `status=${response.status}`);
      return null;
    }
    if (!response.ok) {
      logger.warn('GitHub API 请求失败，列表页将降级', `status=${response.status}`);
      return null;
    }

    const body = await response.json();
    if (body.errors) {
      logger.warn('GitHub GraphQL 返回错误，列表页将降级', JSON.stringify(body.errors).slice(0, 300));
      return null;
    }

    const discussions = body.data?.repository?.discussions;
    if (!discussions?.nodes) {
      logger.warn('GraphQL 响应结构异常，列表页将降级');
      return null;
    }

    collected.push(...discussions.nodes);
    if (!discussions.pageInfo?.hasNextPage || !discussions.pageInfo.endCursor) break;
    if (page === MAX_PAGES - 1) {
      logger.warn('discussions 数量超过分页上限，列表可能不完整', `pages=${MAX_PAGES} perPage=${DISCUSSIONS_PER_PAGE}`);
      break;
    }
    cursor = discussions.pageInfo.endCursor;
  }

  return normalizeDiscussionNodes(collected);
};

/**
 * 抓取说说与留言板两个分类的讨论列表。
 *
 * 分类 ID 缺失（未配置 / 仓库还没建分类）时该区域返回空数组并 warn —— 不阻塞构建：
 * 页面会显示「尚未开通」占位，站长在 GitHub 建好分类并填进 comments.config.json 即可恢复。
 * @param {object} [options]
 * @param {string} [options.token]
 * @returns {Promise<{shuoshuo: object[], guestbook: object[]} | null>}
 */
export const fetchDiscussionLists = async ({ token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '' } = {}) => {
  const siteConfig = loadSiteConfig({ logger });
  const repo = siteConfig.comments?.repo;
  if (!repo || typeof repo !== 'string' || !repo.includes('/')) {
    logger.warn('comments.repo 未配置或格式非法，跳过 discussions 抓取');
    return null;
  }
  if (!token) {
    // 与 fetch-giscus-comments 一致：GITHUB_TOKEN 是 secret，Actions 里必须由 workflow
    // 显式 `env:` 注入到 build 步骤；本地无 token 时优雅跳过。
    logger.warn('未设置 GITHUB_TOKEN/GH_TOKEN，跳过 discussions 抓取（本地构建可接受，CI 需在 build 步骤显式注入）');
    return null;
  }

  const [owner, name] = repo.split('/');
  const areas = [
    {
      key: 'shuoshuo',
      label: '说说',
      categoryId: siteConfig.shuoshuo?.categoryId,
      name: siteConfig.shuoshuo?.categoryName,
      legacyId: siteConfig.shuoshuo?.discussionId,
    },
    {
      key: 'guestbook',
      label: '留言板',
      categoryId: siteConfig.guestbook?.categoryId,
      name: siteConfig.guestbook?.categoryName,
      legacyId: siteConfig.guestbook?.discussionId,
    },
  ];

  const result = { shuoshuo: [], guestbook: [] };
  let failed = false;

  for (const area of areas) {
    if (!area.categoryId) {
      logger.warn(`${area.label}分类未配置（comments.config.json 的 ${area.key}.categoryId），该区域列表留空`);
      continue;
    }
    const list = await fetchCategoryDiscussions({ owner, name, categoryId: area.categoryId, token });
    if (list === null) {
      failed = true;
      continue;
    }
    // 迁移前的「合集讨论」（旧结构里一条 Discussion 装全部内容）本身不是一条内容：
    // 留着它会让列表里多出一条标题叫「说说」/「留言板」的假条目。
    const legacyNumber = Number(area.legacyId);
    const filtered =
      Number.isFinite(legacyNumber) && legacyNumber > 0 ? list.filter((item) => item.number !== legacyNumber) : list;
    if (filtered.length !== list.length) {
      logger.step(`${area.label}：已排除迁移前的合集讨论 #${legacyNumber}（它只作备份，不进入列表）`);
    }
    result[area.key] = filtered;
    logger.step(`${area.label}列表已抓取`, { category: area.name ?? area.key, count: filtered.length });
  }

  // 两个区域全失败时返回 null：让调用方按「整体降级」处理（不写空数据覆盖上一版）。
  if (failed && result.shuoshuo.length === 0 && result.guestbook.length === 0) return null;
  if (failed) logger.warn('部分区域的 discussions 抓取失败，列表可能不完整');
  return result;
};

// 独立运行（node scripts/fetch-discussions.mjs）：手动核对用，不参与构建。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lists = await fetchDiscussionLists();
  console.log(JSON.stringify(lists, null, 2));
}
