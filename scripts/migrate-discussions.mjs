/**
 * migrate-discussions.mjs — 把历史说说/留言搬成「一条内容 = 一条 Discussion」。
 *
 * 为什么需要一次性迁移：改造前留言板（#2）与说说（#4）各是一条大 Discussion，
 * 全部内容都是它的评论。改结构后新内容各自成帖，但老内容还留在旧讨论里 ——
 * 不搬的话，站内列表里就再也看不到它们了。
 *
 * 安全口径（与 scripts/lib/discussion-migrate-core.mjs 的规则一一对应）：
 *   1. **只新建、不改不删**：在目标分类（「说说」/「留言板」）下按原评论正文新建
 *      Discussion；原讨论与其中的评论**完整保留**（备份，随时可回退查看）。
 *   2. **幂等**：新 Discussion 正文开头埋 `<!-- pldduck-migrated:<源评论id> -->`；
 *      重跑时已有标记的评论直接跳过。
 *   3. **默认预演**：不加 `--apply` 只打印计划，不调用任何写接口。
 *   4. 正文里的图片是原始绝对 URL，搬过去仍然可用。
 *
 * 运行环境：GITHUB_TOKEN（GraphQL 需 discussions 读写）、GITHUB_REPOSITORY。
 * 配置：comments.config.json 的 `guestbook` / `shuoshuo` 段 ——
 *   `discussionId` 是**源**讨论编号（旧合集），`categoryId` 是**目标**分类。
 *
 * 用法：
 *   node scripts/migrate-discussions.mjs                    # 预演两个区域
 *   node scripts/migrate-discussions.mjs --surface guestbook # 只看留言板
 *   node scripts/migrate-discussions.mjs --apply            # 真正执行
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchWithRetry, createTimeoutSignal, readResponseText } from './lib/http.mjs';
import { createActionLogger, formatError, installGlobalErrorHandlers } from './lib/gh-actions-logger.mjs';
import { loadSiteConfig } from './site-config-loader.mjs';
import {
  buildMigratedBody,
  planDiscussionMigration,
  readMigrationMarker,
  renderMigrationReport,
} from './lib/discussion-migrate-core.mjs';
import { deriveDiscussionTitle } from '../src/utils/discussion-core.mjs';

const logger = createActionLogger('migrate-discussions');
installGlobalErrorHandlers(logger);

const GRAPHQL_URL = 'https://api.github.com/graphql';
const GRAPHQL_TIMEOUT_MS = 20000;
const GRAPHQL_RETRIES = 2;
/** 分页防御上限（目标分类里的历史讨论 / 源讨论的评论）。 */
const MAX_PAGES = 20;
const PAGE_SIZE = 50;

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const readArg = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : '';
};

/** 是否真的写入：默认预演。 */
const APPLY = hasFlag('apply');
const SURFACE_FILTER = readArg('surface');

const graphql = async (query, variables) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.warn('GITHUB_TOKEN 未设置，无法调用 GitHub GraphQL');
    return null;
  }
  const { signal, cleanup } = createTimeoutSignal(GRAPHQL_TIMEOUT_MS * (GRAPHQL_RETRIES + 1) * 2);
  try {
    const response = await fetchWithRetry(
      GRAPHQL_URL,
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'pldduck-discussion-migrate/1.0',
        },
        body: JSON.stringify({ query, variables }),
      },
      {
        retries: GRAPHQL_RETRIES,
        timeoutMs: GRAPHQL_TIMEOUT_MS,
        signal,
        onRetry: (info) => logger.warn('GraphQL 重试中', { attempt: info.attempt, status: info.status ?? 'network' }),
      },
    );
    const raw = await readResponseText(response, { maxBytes: 5 * 1024 * 1024 });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn('GraphQL 返回非 JSON', { status: response.status });
      return null;
    }
    if (!response.ok || parsed.errors) {
      logger.warn('GraphQL 请求失败', {
        status: response.status,
        errors: parsed.errors ?? parsed.message ?? 'unknown',
      });
      return null;
    }
    return parsed.data;
  } catch (error) {
    logger.warn('GraphQL 请求重试后仍失败', { error: formatError(error) });
    return null;
  } finally {
    cleanup();
  }
};

/** 读取源讨论（旧合集）下的全部评论。 */
const SOURCE_COMMENTS_QUERY = `query SourceComments($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    discussion(number: $number) {
      id
      title
      comments(first: ${PAGE_SIZE}, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id body createdAt author { login } }
      }
    }
  }
}`;

const readSourceComments = async ({ owner, repo, number }) => {
  const comments = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql(SOURCE_COMMENTS_QUERY, { owner, repo, number, cursor });
    const connection = data?.repository?.discussion?.comments;
    if (!connection) {
      logger.warn('读不到源讨论的评论（编号不对或无权限）', { number });
      return null;
    }
    comments.push(...(connection.nodes ?? []));
    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo?.endCursor) break;
    cursor = connection.pageInfo.endCursor;
  }
  return comments;
};

/** 读取目标分类下已有的迁移标记（用于幂等判断）。 */
const TARGET_DISCUSSIONS_QUERY = `query TargetDiscussions($owner: String!, $repo: String!, $categoryId: ID!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    discussions(first: ${PAGE_SIZE}, after: $cursor, categoryId: $categoryId) {
      pageInfo { hasNextPage endCursor }
      nodes { number body }
    }
  }
}`;

const readExistingMarkers = async ({ owner, repo, categoryId }) => {
  const markers = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await graphql(TARGET_DISCUSSIONS_QUERY, { owner, repo, categoryId, cursor });
    const connection = data?.repository?.discussions;
    if (!connection) {
      logger.warn('读不到目标分类的讨论列表（分类 ID 不对或无权限）');
      return null;
    }
    for (const node of connection.nodes ?? []) {
      const marker = readMigrationMarker(node?.body);
      if (marker) markers.push(marker);
    }
    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo?.endCursor) break;
    cursor = connection.pageInfo.endCursor;
  }
  return markers;
};

const CREATE_DISCUSSION_MUTATION = `mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
    discussion { number url }
  }
}`;

const REPOSITORY_ID_QUERY = `query RepoId($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) { id }
}`;

/**
 * 把一条评论搬成 Discussion。
 * @returns {Promise<{number: number, url: string} | null>}
 */
const createMigratedDiscussion = async ({ repositoryId, categoryId, title, body }) => {
  const data = await graphql(CREATE_DISCUSSION_MUTATION, { repositoryId, categoryId, title, body });
  const created = data?.createDiscussion?.discussion;
  return created ? { number: created.number, url: created.url } : null;
};

/**
 * 迁移一个区域。
 * @param {object} input
 * @param {'guestbook'|'shuoshuo'} input.surface
 * @param {object} input.config 该区域的配置（discussionId / categoryId / categoryName）
 * @param {string} input.owner
 * @param {string} input.repo
 * @param {string} input.repositoryId
 * @returns {Promise<{created: number, skipped: number, failed: number} | null>}
 */
const migrateSurface = async ({ surface, config, owner, repo, repositoryId }) => {
  const label = surface === 'shuoshuo' ? '说说' : '留言板';
  const sourceNumber = Number(config?.discussionId);
  const categoryId = config?.categoryId;

  if (!Number.isFinite(sourceNumber) || sourceNumber <= 0) {
    logger.info(`${label}：未配置源讨论编号（discussionId），本区域无需迁移`);
    return null;
  }
  if (!categoryId) {
    logger.warn(`${label}：未配置目标分类 ID（categoryId），无法迁移`);
    return null;
  }

  const sourceComments = await readSourceComments({ owner, repo, number: sourceNumber });
  if (sourceComments === null) return null;
  const existingMarkers = await readExistingMarkers({ owner, repo, categoryId });
  if (existingMarkers === null) return null;

  const plan = planDiscussionMigration({ sourceComments, existingMarkers, surface });
  const report = renderMigrationReport(plan, { surfaceLabel: label, applied: APPLY });
  console.log(`\n${report}\n`);
  logger.info(`${label}迁移计划`, {
    toCreate: plan.toCreate.length,
    alreadyMigrated: plan.alreadyMigrated.length,
    skipped: plan.skipped.length,
    apply: APPLY,
  });

  if (!APPLY || plan.toCreate.length === 0) {
    return { created: 0, skipped: plan.alreadyMigrated.length, failed: 0 };
  }

  let created = 0;
  let failed = 0;
  for (const row of plan.toCreate) {
    // 标题用原评论首句（与列表页的派生口径一致），正文带迁移标记 + 原正文。
    const title = deriveDiscussionTitle(row.body);
    const result = await createMigratedDiscussion({
      repositoryId,
      categoryId,
      title,
      body: buildMigratedBody({
        commentId: row.commentId,
        body: row.body,
        author: row.author,
        createdAt: row.createdAt,
      }),
    });
    if (result) {
      created += 1;
      logger.info(`${label}：已迁移一条`, { from: row.commentId, to: result.number });
    } else {
      failed += 1;
      logger.warn(`${label}：迁移失败，跳过该条`, { commentId: row.commentId });
    }
  }

  return { created, skipped: plan.alreadyMigrated.length, failed };
};

const main = async () => {
  const siteConfig = loadSiteConfig({ logger });
  const repoFull = String(process.env.GITHUB_REPOSITORY || siteConfig.comments?.repo || '');
  const [owner, repo] = repoFull.split('/');
  if (!owner || !repo) {
    logger.error('GITHUB_REPOSITORY 缺失或格式不对（应为 owner/repo）');
    return 1;
  }
  if (!process.env.GITHUB_TOKEN) {
    logger.warn('GITHUB_TOKEN 未设置：无法读取 Discussions（本地预演也需要只读 token）');
    return 1;
  }

  logger.info(APPLY ? '开始迁移（写入模式）' : '开始迁移（预演模式，不写入）', {
    repo: repoFull,
    surface: SURFACE_FILTER || 'all',
  });

  const repoData = await graphql(REPOSITORY_ID_QUERY, { owner, repo });
  const repositoryId = repoData?.repository?.id;
  if (!repositoryId) {
    logger.error('读不到仓库 ID，中止');
    return 1;
  }

  const surfaces = [
    { surface: 'guestbook', config: siteConfig.guestbook },
    { surface: 'shuoshuo', config: siteConfig.shuoshuo },
  ].filter((item) => !SURFACE_FILTER || item.surface === SURFACE_FILTER);

  if (surfaces.length === 0) {
    logger.error(`未知的 --surface 值：${SURFACE_FILTER}（只支持 guestbook / shuoshuo）`);
    return 1;
  }

  const totals = { created: 0, skipped: 0, failed: 0 };
  for (const item of surfaces) {
    const result = await migrateSurface({ ...item, owner, repo, repositoryId });
    if (result) {
      totals.created += result.created;
      totals.skipped += result.skipped;
      totals.failed += result.failed;
    }
  }

  logger.summary({ mode: APPLY ? 'apply' : 'dry-run', ...totals });
  // 有失败就以非零退出，让 Actions 页面可见（不静默）。
  return totals.failed > 0 ? 1 : 0;
};

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  try {
    process.exitCode = await main();
  } catch (error) {
    logger.error('迁移失败', formatError(error));
    process.exitCode = 1;
  }
}

// 供测试/复用：脚本内不导出副作用，仅暴露路径常量。
export const MIGRATION_SCRIPT_PATH = path.resolve(fileURLToPath(import.meta.url));
