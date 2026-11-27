// @vitest-environment node
/**
 * 历史评论迁移的纯函数：标记、幂等规划与报告文案。
 *
 * 迁移不可逆（Discussion 一旦建立就带上真实作者与会话），所以这里把「什么时候不该搬」
 * 全部钉在纯函数里：标记已存在、正文为空、源评论重复 —— 三类都必须跳过。
 */
import { describe, it, expect } from 'vitest';
import {
  buildMigratedBody,
  buildMigrationMarker,
  planDiscussionMigration,
  readMigrationMarker,
  renderMigrationReport,
} from './discussion-migrate-core.mjs';

describe('迁移标记', () => {
  it('生成与解析互为逆运算', () => {
    const marker = buildMigrationMarker('DC_abc123');
    expect(marker).toBe('<!-- pldduck-migrated:DC_abc123 -->');
    expect(readMigrationMarker(`前言\n${marker}\n\n正文`)).toBe('DC_abc123');
  });

  it('没有标记时返回 null', () => {
    expect(readMigrationMarker('普通正文')).toBeNull();
    expect(readMigrationMarker('')).toBeNull();
    expect(readMigrationMarker(undefined)).toBeNull();
  });

  it('标记写在正文最前面（位置漂移会导致重复搬运）', () => {
    const body = buildMigratedBody({ commentId: 'DC_1', body: '  正文内容  ' });
    expect(body.startsWith('<!-- pldduck-migrated:DC_1 -->')).toBe(true);
    expect(body).toBe('<!-- pldduck-migrated:DC_1 -->\n\n正文内容');
  });

  it('带上原作者署名（新建讨论的作者是仓库主，不写就永久丢失原作者）', () => {
    const body = buildMigratedBody({
      commentId: 'DC_9',
      body: '你好呀',
      author: 'AUkarl',
      createdAt: '2026-11-16T05:42:38Z',
    });
    expect(body).toContain('> 由 @AUkarl · 原发布于 2026-11-16 的旧留言迁移');
    // 署名在正文之后，不挡正文首行（列表摘要取的是正文第一段）。
    expect(body.indexOf('你好呀')).toBeLessThan(body.indexOf('由 @AUkarl'));
  });
});

describe('planDiscussionMigration', () => {
  const comment = (id, body, extra = {}) => ({
    id,
    body,
    author: { login: 'alice' },
    createdAt: '2026-11-01T00:00:00Z',
    ...extra,
  });

  it('正文非空的评论进待建清单', () => {
    const plan = planDiscussionMigration({
      sourceComments: [comment('DC_1', '第一条'), comment('DC_2', '第二条')],
      existingMarkers: [],
      surface: 'guestbook',
    });
    expect(plan.toCreate.map((row) => row.commentId)).toEqual(['DC_1', 'DC_2']);
    expect(plan.alreadyMigrated).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it('幂等：已有标记的评论不重复搬', () => {
    const plan = planDiscussionMigration({
      sourceComments: [comment('DC_1', '第一条'), comment('DC_2', '第二条')],
      existingMarkers: ['DC_1'],
    });
    expect(plan.toCreate.map((row) => row.commentId)).toEqual(['DC_2']);
    expect(plan.alreadyMigrated.map((row) => row.commentId)).toEqual(['DC_1']);
  });

  it('空正文与缺 id 的评论跳过，并说明原因', () => {
    const plan = planDiscussionMigration({
      sourceComments: [comment('DC_1', '   '), { body: '没有 id' }, comment('DC_3', '正常')],
    });
    expect(plan.toCreate.map((row) => row.commentId)).toEqual(['DC_3']);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.map((row) => row.reason)).toEqual(['正文为空（评论可能已被删除）', '评论缺少 id']);
  });

  it('同一源评论重复出现只搬一次（分页重叠等）', () => {
    const plan = planDiscussionMigration({
      sourceComments: [comment('DC_1', '甲'), comment('DC_1', '甲（重复）')],
    });
    expect(plan.toCreate).toHaveLength(1);
  });

  it('空输入产出空计划（不抛错）', () => {
    expect(planDiscussionMigration()).toEqual({ toCreate: [], alreadyMigrated: [], skipped: [] });
  });
});

describe('renderMigrationReport', () => {
  it('预演与执行两种口径的说明不同', () => {
    const plan = planDiscussionMigration({ sourceComments: [{ id: 'DC_1', body: '内容', author: { login: 'a' } }] });
    const dry = renderMigrationReport(plan, { surfaceLabel: '留言板', applied: false });
    expect(dry).toContain('预演（未写入）');
    expect(dry).toContain('未改动');
    const applied = renderMigrationReport(plan, { surfaceLabel: '留言板', applied: true });
    expect(applied).toContain('已执行');
    expect(applied).toContain('全部保留');
  });

  it('列出待建条目并截断过长清单', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: `DC_${index}`,
      body: '内容',
      author: { login: 'a' },
      createdAt: '2026-11-01T00:00:00Z',
    }));
    const text = renderMigrationReport(planDiscussionMigration({ sourceComments: many }));
    expect(text).toContain('待新建 25');
    expect(text).toContain('其余 5 条省略');
  });
});
