/**
 * friend-repo-io.mjs — 机器人写本仓库文件与触发 workflow 的唯一出口。
 *
 * 两个消费者：`scripts/friend-link-check.mjs`（友链 Issue 入库）与
 * `scripts/friend-availability-check.mjs`（每日失联巡检）。两处都要
 * 「读文件 → 带 sha 写回 → dispatch 部署」，规则一模一样，复制一份就会漂移。
 *
 * 口径：
 *   - token 只进 Authorization 头；错误信息只保留状态码与 API 文案片段，
 *     不带响应体全文（AGENT.md 的日志安全条款）；
 *   - 写入一律 Contents API + sha 乐观锁，409 只重取 sha 重试**一次**，
 *     且必须由调用方传入的 `assertSame` 谓词确认「冲突文件还是同一条记录」，
 *     否则硬失败让人工处理 —— 机器人永远不许盲覆盖别人的改动；
 *   - 目标分支固定 main，不接受调用方指定别的分支写入。
 */

export const GITHUB_API_BASE = 'https://api.github.com';
export const TARGET_BRANCH = 'main';

const SILENT_LOGGER = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * @param {object} options
 * @param {string} options.token        GITHUB_TOKEN（缺失时任何请求都会抛错）
 * @param {string} options.owner        仓库 owner
 * @param {string} options.repo         仓库名
 * @param {object} [options.logger]     复用 gh-actions-logger 的实例
 * @param {string} [options.apiBase]
 * @param {string} [options.branch]
 * @param {typeof fetch} [options.fetchImpl] 测试注入
 */
export const createRepoClient = ({
  token,
  owner,
  repo,
  logger = SILENT_LOGGER,
  apiBase = GITHUB_API_BASE,
  branch = TARGET_BRANCH,
  fetchImpl = globalThis.fetch,
}) => {
  const requireRepo = () => {
    if (!owner || !repo) throw new Error('GITHUB_REPOSITORY 缺失或格式不对（应为 owner/repo）');
  };

  const request = async (method, endpoint, { body, headers = {}, allow404 = false } = {}) => {
    if (!token) throw new Error('GITHUB_TOKEN 未设置，无法调用 GitHub API');
    const response = await fetchImpl(`${apiBase}${endpoint}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 404 && allow404) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`GitHub API ${method} ${endpoint} → HTTP ${response.status}`);
      error.status = response.status;
      try {
        error.apiMessage = String(JSON.parse(text).message || '').slice(0, 200);
      } catch {
        error.apiMessage = text.slice(0, 200);
      }
      throw error;
    }
    return text ? JSON.parse(text) : null;
  };

  /** 读取仓库内文件现有内容与 blob sha（不存在时返回 null）。 */
  const readRepoFile = async (filePath) => {
    requireRepo();
    const data = await request('GET', `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, {
      allow404: true,
    });
    if (!data || Array.isArray(data)) return null;
    return { sha: data.sha, content: Buffer.from(String(data.content || ''), 'base64').toString('utf8') };
  };

  /**
   * 写入单个文件（Contents API + sha 乐观锁）。
   * @param {(record: any) => boolean} [options.assertSame] 冲突重试前的同一性判据：
   *   Issue 入库路径按归一化 URL 认人，巡检路径按 filename 认人。不给就不重试。
   */
  const writeRepoFile = async ({ filePath, content, message, sha, assertSame }) => {
    requireRepo();
    let currentSha = sha;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const payload = {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        ...(currentSha ? { sha: currentSha } : {}),
      };
      try {
        return await request('PUT', `/repos/${owner}/${repo}/contents/${filePath}`, { body: payload });
      } catch (error) {
        const conflict = error.status === 409 || /sha was supposed to be/i.test(error.apiMessage || '');
        if (!conflict || attempt === 2 || typeof assertSame !== 'function') throw error;
        logger.warn('写入冲突（sha 过期），重取 sha 后重试一次', { filePath });
        const fresh = await readRepoFile(filePath);
        if (!fresh) throw error;
        let sameRecord = false;
        try {
          sameRecord = assertSame(JSON.parse(fresh.content));
        } catch {
          sameRecord = false;
        }
        if (!sameRecord) throw new Error('目标文件已被他人改动成另一条记录，为避免覆盖请人工处理');
        currentSha = fresh.sha;
      }
    }
    throw new Error('未到达（写入重试循环提前返回）');
  };

  /**
   * 触发 workflow_dispatch。deploy.yml 只允许 main，payload 按其守卫形状给
   * （`${{ }}` 不进 run:，脚本自己校验 repository.ref）。
   */
  const dispatchWorkflow = async (workflow, { ref = branch } = {}) => {
    requireRepo();
    await request('POST', `/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
      body: {
        ref,
        inputs: { payload: JSON.stringify({ repository: { ref } }) },
      },
    });
  };

  return { request, readRepoFile, writeRepoFile, dispatchWorkflow, owner, repo, branch };
};
