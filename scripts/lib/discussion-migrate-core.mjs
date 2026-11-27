/**
 * discussion-migrate-core.mjs — 历史评论迁移为「一条内容 = 一条 Discussion」的纯函数层。
 *
 * 背景：2026-11 之前，留言板与说说各自只有一条大 Discussion，全部留言/说说都是它的
 * 评论。这导致 GitHub 的 Discussion 级邮件通知把「所有留过言的人」都卷进来。
 * 改造后每条内容一条 Discussion，历史评论需要搬过去，否则老内容在新列表里看不到。
 *
 * 迁移口径（硬约束）：
 *   1. **不改、不删原始评论**：只在目标分类里新建一条 Discussion（正文即原评论正文），
 *      原讨论保持原样留作备份 —— 迁移不可逆，删了就没了。
 *   2. **幂等**：新 Discussion 正文开头埋 `<!-- pldduck-migrated:<源评论id> -->` 标记，
 *      重跑时已有标记的评论直接跳过（反复跑不会产生重复内容）。
 *   3. **可预演**：默认 dry-run，只输出计划；`--apply` 才真的写。
 *   4. **只搬正文非空的评论**（GitHub 允许评论被删后留空壳，空正文搬到新讨论没有意义）。
 */

/** 迁移标记前缀：`<!-- pldduck-migrated:<commentNodeId> -->`。 */
export const MIGRATION_MARKER_PREFIX = 'pldduck-migrated:';

/** 生成某个源评论的迁移标记。 */
export const buildMigrationMarker = (commentId) =>
  `<!-- ${MIGRATION_MARKER_PREFIX}${String(commentId ?? '').trim()} -->`;

/**
 * 从讨论正文里读出迁移标记（没有则返回 null）。
 * @param {string} body
 * @returns {string | null} 源评论 id
 */
export const readMigrationMarker = (body) => {
  const match = String(body ?? '').match(/<!--\s*pldduck-migrated:([^\s>]+)\s*-->/);
  return match ? match[1] : null;
};

/**
 * 生成迁移后的 Discussion 正文：标记 + 原正文 + 原作者署名。
 *
 * 标记必须在正文最前面（GraphQL 读回来时按前缀判断，位置漂移就会重搬）。
 *
 * **为什么必须带署名**：新建 Discussion 的作者一定是仓库主（token 持有者），
 * 原评论是谁写的这个信息一旦不写进正文就永久丢失了 —— 而这些讨论是要公开展示的。
 * 署名行用引用块，渲染出来是一行弱化的小字，不干扰正文阅读。
 *
 * @param {object} input
 * @param {string} input.commentId 源评论的 GraphQL node id
 * @param {string} input.body 原评论正文
 * @param {string} [input.author] 原评论作者登录名
 * @param {string} [input.createdAt] 原评论时间（ISO）
 * @returns {string}
 */
export const buildMigratedBody = ({ commentId, body, author = '', createdAt = '' }) => {
  const marker = buildMigrationMarker(commentId);
  const content = String(body ?? '').trim();
  const bylineParts = [author ? `@${author}` : '', createdAt ? `原发布于 ${createdAt.slice(0, 10)}` : ''].filter(
    Boolean,
  );
  const byline = bylineParts.length > 0 ? `\n\n> 由 ${bylineParts.join(' · ')} 的旧留言迁移` : '';
  return `${marker}\n\n${content}${byline}`;
};

/**
 * 规划一次迁移。
 *
 * @param {object} input
 * @param {Array<{id: string, body: string, author?: {login?: string}, createdAt?: string}>} input.sourceComments
 *   源讨论下的全部评论（含作者与时间，用于计划表展示）
 * @param {Iterable<string>} input.existingMarkers 目标分类下**已存在**的迁移标记（源评论 id）
 * @param {string} [input.surface] 区域标识（'shuoshuo' | 'guestbook'），只用于日志与计划表
 * @returns {{ toCreate: object[], alreadyMigrated: object[], skipped: object[] }}
 */
export const planDiscussionMigration = ({ sourceComments = [], existingMarkers = [], surface = '' } = {}) => {
  const done = new Set([...existingMarkers].map((id) => String(id)));
  const toCreate = [];
  const alreadyMigrated = [];
  const skipped = [];
  const seenInSource = new Set();

  for (const comment of sourceComments) {
    const id = String(comment?.id ?? '').trim();
    const body = String(comment?.body ?? '').trim();
    const row = {
      surface,
      commentId: id,
      author: comment?.author?.login ?? '',
      createdAt: comment?.createdAt ?? '',
      body,
    };

    if (!id) {
      skipped.push({ ...row, reason: '评论缺少 id' });
      continue;
    }
    // 同一个源评论在列表里出现两次（分页重叠等）只搬一次。
    if (seenInSource.has(id)) continue;
    seenInSource.add(id);

    if (done.has(id)) {
      alreadyMigrated.push(row);
      continue;
    }
    if (!body) {
      skipped.push({ ...row, reason: '正文为空（评论可能已被删除）' });
      continue;
    }
    toCreate.push(row);
  }

  return { toCreate, alreadyMigrated, skipped };
};

/**
 * 生成迁移计划的可读文本（Actions 日志 / 本地 dry-run 输出）。
 * @param {ReturnType<typeof planDiscussionMigration>} plan
 * @param {object} [options]
 * @param {string} [options.surfaceLabel]
 * @param {boolean} [options.applied]
 * @returns {string}
 */
export const renderMigrationReport = (plan, { surfaceLabel = '', applied = false } = {}) => {
  const { toCreate, alreadyMigrated, skipped } = plan;
  const lines = [
    `【说说/留言历史迁移】${surfaceLabel ? `${surfaceLabel} ` : ''}${applied ? '已执行' : '预演（未写入）'}`,
    `待新建 ${toCreate.length} / 已迁移 ${alreadyMigrated.length} / 跳过 ${skipped.length}`,
  ];
  if (applied) {
    lines.push('说明：原讨论与其中的评论**全部保留**，可随时回退查看。');
  } else {
    lines.push('说明：这是预演，仓库与 Discussions 均未改动；确认无误后加 --apply 真正执行。');
  }

  if (toCreate.length > 0) {
    lines.push('', '将新建：');
    for (const row of toCreate.slice(0, 20)) {
      const preview = row.body.replace(/\s+/g, ' ').slice(0, 40);
      lines.push(`- @${row.author || 'unknown'} ${row.createdAt || ''}：${preview}`);
    }
    if (toCreate.length > 20) lines.push(`- … 其余 ${toCreate.length - 20} 条省略`);
  }

  if (skipped.length > 0) {
    lines.push('', '跳过：');
    for (const row of skipped.slice(0, 10)) {
      lines.push(`- @${row.author || 'unknown'}：${row.reason}`);
    }
    if (skipped.length > 10) lines.push(`- … 其余 ${skipped.length - 10} 条省略`);
  }

  return lines.join('\n');
};
