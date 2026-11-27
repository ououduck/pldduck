/**
 * dispatch-deploy.mjs — 触发一次 deploy.yml（供 discussion-publish.yml 使用）。
 *
 * 用途：说说/留言板改成「一条内容 = 一条 Discussion」后，列表数据是构建期抓取的，
 * 新建 discussion 不会改仓库文件、也就不会触发部署。本脚本把这件事收敛成一次
 * workflow_dispatch（GITHUB_TOKEN 可以 dispatch，但它的 push 不会触发 workflow）。
 *
 * 口径：
 *   - 只读 + dispatch，不写仓库、不碰讨论；
 *   - 目标分支固定 main（deploy.yml 的守卫也只接受 main）；
 *   - token 只进 Authorization 头，错误信息只保留状态码与 API 文案片段（日志安全）。
 *
 * 本地调试：DRY_RUN=1 时只打印，不发请求。
 */

import { createActionLogger, formatError, installGlobalErrorHandlers } from './lib/gh-actions-logger.mjs';
import { createRepoClient } from './lib/friend-repo-io.mjs';
import { pathToFileURL } from 'node:url';

const logger = createActionLogger('dispatch-deploy');
installGlobalErrorHandlers(logger);

/** 与 .pages.yml / 飞书白名单一致：部署 workflow 的文件名。 */
export const DEPLOY_WORKFLOW_FILE = 'deploy.yml';

/**
 * 触发部署。
 * @param {object} [options]
 * @param {string} [options.token]
 * @param {string} [options.repository] owner/repo
 * @param {boolean} [options.dryRun]
 * @returns {Promise<{ dispatched: boolean, reason?: string }>}
 */
export const dispatchDeploy = async ({
  token = process.env.GITHUB_TOKEN || '',
  repository = process.env.GITHUB_REPOSITORY || '',
  dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true',
} = {}) => {
  const [owner, repo] = String(repository).split('/');
  if (!owner || !repo) {
    logger.warn('GITHUB_REPOSITORY 缺失或格式不对，跳过部署 dispatch', { repository });
    return { dispatched: false, reason: 'missing-repository' };
  }
  if (!token) {
    logger.warn('GITHUB_TOKEN 未设置，跳过部署 dispatch（本地运行可接受，CI 需注入）');
    return { dispatched: false, reason: 'missing-token' };
  }
  if (dryRun) {
    logger.info('DRY_RUN：跳过部署 dispatch', { owner, repo, workflow: DEPLOY_WORKFLOW_FILE });
    return { dispatched: false, reason: 'dry-run' };
  }

  const client = createRepoClient({ token, owner, repo, logger });
  try {
    await client.dispatchWorkflow(DEPLOY_WORKFLOW_FILE);
    logger.info('已触发部署', { workflow: DEPLOY_WORKFLOW_FILE, owner, repo });
    return { dispatched: true };
  } catch (error) {
    // dispatch 失败不影响内容本身（下一条内容或下一次 push 仍会部署），如实记录后失败退出，
    // 让 Actions 页面能看见（不静默吞掉）。
    logger.error('触发部署失败', { error: formatError(error) });
    throw error;
  }
};

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  try {
    await dispatchDeploy();
  } catch {
    // dispatchDeploy 内部已记录完整上下文，这里只保证退出码非零。
    process.exitCode = 1;
  }
}
