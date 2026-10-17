/**
 * workflows-config.test.mjs — .github/workflows 与 Pages CMS 按钮、飞书白名单、
 * ai-rules 计数之间的契约。此前没有任何测试看过 workflow 目录，
 * 「新增 workflow 忘了进飞书白名单」这类漂移只能靠人记住（ai-rules/ci-cd.md 规则里写着）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = path.join(ROOT_DIR, '.github', 'workflows');
const FEISHU_FILE = 'feishu-webhook.yml';

const readWorkflow = (file) => yaml.load(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));

const workflowFiles = () =>
  fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((file) => file.endsWith('.yml'))
    .sort();

/** 收集 workflow 里所有 `run:` 脚本（jobs.*.steps[].run）。 */
const collectRuns = (doc) => {
  const runs = [];
  for (const job of Object.values(doc?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step.run === 'string') runs.push(step.run);
    }
  }
  return runs;
};

describe('workflow 清单', () => {
  it('目录可发现且非空', () => {
    expect(workflowFiles().length).toBeGreaterThan(5);
  });

  it('每个 workflow 都有 name（飞书白名单按 name 匹配）', () => {
    for (const file of workflowFiles()) {
      expect(readWorkflow(file).name, `${file} 缺 name`).toBeTruthy();
    }
  });
});

describe('飞书白名单覆盖', () => {
  const whitelist = readWorkflow(FEISHU_FILE).on.workflow_run.workflows;

  it('除自身外每个 workflow 的 name 都在白名单里', () => {
    const missing = workflowFiles()
      .filter((file) => file !== FEISHU_FILE)
      .map((file) => readWorkflow(file).name)
      .filter((name) => !whitelist.includes(name));
    expect(missing, `未加入 feishu-webhook.yml 白名单：${missing.join(', ')}`).toEqual([]);
  });

  it('白名单里没有指向已删除 workflow 的僵尸条目', () => {
    const names = new Set(workflowFiles().map((file) => readWorkflow(file).name));
    const stale = whitelist.filter((name) => !names.has(name));
    expect(stale, `白名单里有不存在的 workflow：${stale.join(', ')}`).toEqual([]);
  });

  it('白名单按字母序（便于人工 diff）', () => {
    // 默认码点排序，与白名单现有写法一致（"CI" 在 "Check Broken Links" 之前；localeCompare 会给出相反结果）。
    expect([...whitelist].sort()).toEqual(whitelist);
  });
});

describe('run: 脚本的注入面', () => {
  it('任何 run: 块都不内插 ${{ }}（表达式一律先落到 env:）', () => {
    const offenders = [];
    for (const file of workflowFiles()) {
      for (const run of collectRuns(readWorkflow(file))) {
        if (run.includes('${{')) offenders.push(`${file}: ${run.slice(0, 60)}`);
      }
    }
    expect(offenders, `GitHub 表达式内插进 shell：\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('Pages CMS 按钮', () => {
  const config = yaml.load(fs.readFileSync(path.join(ROOT_DIR, '.pages.yml'), 'utf8'));
  const actions = config.actions ?? [];

  it('每个 action 的 workflow 文件真实存在', () => {
    expect(actions.length).toBeGreaterThan(0);
    const missing = actions
      .map((action) => action.workflow)
      .filter((workflow) => workflow && !fs.existsSync(path.join(WORKFLOWS_DIR, workflow)));
    expect(missing, `.pages.yml 指向不存在的 workflow：${missing.join(', ')}`).toEqual([]);
  });

  it('每个 action 都有 name/label/workflow 与确认文案', () => {
    for (const action of actions) {
      expect(action.name, 'action 缺 name').toBeTruthy();
      expect(action.label, `${action.name} 缺 label`).toBeTruthy();
      expect(action.workflow, `${action.name} 缺 workflow`).toBeTruthy();
      expect(action.confirm?.title, `${action.name} 缺确认标题`).toBeTruthy();
      expect(action.confirm?.message, `${action.name} 缺确认说明`).toBeTruthy();
    }
  });

  it('失联审核按钮指向带写权限的巡检 workflow', () => {
    const audit = actions.find((action) => action.workflow === 'friend-availability-audit.yml');
    expect(audit, '缺「友链失联审核」按钮').toBeTruthy();
    expect(audit.confirm.message).toContain('已失联');
  });
});

describe('巡检 workflow 的写入契约', () => {
  const audit = readWorkflow('friend-availability-audit.yml');

  it('权限声明在 workflow 级且覆盖写入所需', () => {
    expect(audit.permissions).toMatchObject({ contents: 'write', actions: 'write' });
    for (const [key, job] of Object.entries(audit.jobs)) {
      const granted = job.permissions ?? {};
      const values = typeof granted === 'string' ? [granted] : Object.values(granted);
      expect(values, `${key} 不应在 job 级扩权`).not.toContain('write');
    }
  });

  it('串行执行且定时为每天一次', () => {
    expect(audit.concurrency).toMatchObject({ group: 'friend-availability-audit', 'cancel-in-progress': false });
    expect(audit.on.schedule).toEqual([{ cron: '0 2 * * *' }]);
  });

  it('dispatch 输入含 payload 与 dry_run', () => {
    const inputs = audit.on.workflow_dispatch.inputs;
    expect(inputs.payload.required).toBe(true);
    expect(inputs.dry_run.default).toBe(false);
  });
});

describe('ai-rules 计数与真实 workflow 数一致', () => {
  it('ci-cd.md 里写的数量等于目录实际值', () => {
    const text = fs.readFileSync(path.join(ROOT_DIR, 'ai-rules', 'ci-cd.md'), 'utf8');
    const match = text.match(/\.github\/workflows\/\*\.yml`（(\d+) 个）/);
    expect(match, 'ai-rules/ci-cd.md 里的 workflow 计数写法变了，测试跟着改').toBeTruthy();
    expect(Number(match[1]), 'workflow 数量与 ai-rules 不一致').toBe(workflowFiles().length);
  });
});
