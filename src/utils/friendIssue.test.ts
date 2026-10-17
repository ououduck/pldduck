// @vitest-environment node
/**
 * 预填正文必须能被机器人的解析器读回，且段标题/顺序/勾选项必须与 Issue 模板逐字一致 ——
 * 这两件事分别由「往返解析」与「漂移守卫」两组用例守着，改任一边都会在这里变红。
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  FRIEND_ISSUE_CONFIRMATIONS,
  FRIEND_ISSUE_SECTION_LABELS,
  buildFriendIssueBody,
  buildFriendIssueUrl,
  type FriendApplicationInput,
} from './friendIssue';
import {
  FRIEND_APPLICATION_TYPES,
  FRIEND_FIELDS,
  parseFriendIssueBody,
  validateFriendRecord,
} from '../../scripts/lib/friend-form-core.mjs';

const input: FriendApplicationInput = {
  name: '阿叶的小站',
  url: 'https://ayee.example.com',
  backlinkUrl: 'https://ayee.example.com/friends',
  avatar: 'https://ayee.example.com/avatar.png',
  description: '前端与生活方式记录',
  applicationType: FRIEND_APPLICATION_TYPES[0],
};

/** 解析器是 JS 模块，返回值对 TS 只是 unknown 形状；测试里按已知结构收窄。 */
interface ParsedIssue {
  ok: boolean;
  values?: Record<string, string>;
  confirmations?: string[];
  unknown?: string[];
}
interface ValidatedIssue {
  ok: boolean;
  record?: { name: string; url: string; avatar: string; description: string };
  backlinkUrl?: string;
}
interface TemplateItem {
  type: string;
  attributes?: { label?: string; options?: Array<{ label: string; required?: boolean }> };
}

const parse = (body: string): ParsedIssue => parseFriendIssueBody(body) as ParsedIssue;
const validate = (parsed: ParsedIssue): ValidatedIssue =>
  validateFriendRecord(parsed.values, {
    acceptedHosts: new Set(['www.pldduck.com', 'pldduck.com']),
  }) as ValidatedIssue;
const fieldsOf = (source: FriendApplicationInput): Record<string, string> =>
  source as unknown as Record<string, string>;

describe('友链 Issue 预填正文', () => {
  it('生成的正文能被解析器完整读回', () => {
    const parsed = parse(buildFriendIssueBody(input));
    expect(parsed.ok).toBe(true);
    const source = fieldsOf(input);
    for (const field of FRIEND_FIELDS.filter((item: { key: string }) => item.key !== 'confirmations')) {
      expect(parsed.values?.[field.key]).toBe(source[field.key]);
    }
  });

  it('正文经解析后再过校验器，产出可入库的记录', () => {
    const parsed = parse(buildFriendIssueBody(input));
    const validated = validate(parsed);
    expect(validated.ok).toBe(true);
    expect(validated.record).toEqual({
      name: input.name,
      url: input.url,
      avatar: input.avatar,
      description: input.description,
    });
    expect(validated.backlinkUrl).toBe(input.backlinkUrl);
  });

  it('反链页面留空写成 _No response_，解析后是空值而不是缺段', () => {
    const parsed = parse(buildFriendIssueBody({ ...input, backlinkUrl: '   ' }));
    expect(parsed.ok).toBe(true);
    expect(parsed.values?.backlinkUrl).toBe('');
    expect(parsed.values?.url).toBe(input.url);
  });

  it('值里的换行会被压平，不会撕开分段', () => {
    const parsed = parse(buildFriendIssueBody({ ...input, description: '第一行\n### 伪造段' }));
    expect(parsed.ok).toBe(true);
    expect(parsed.values?.description).toBe('第一行 ### 伪造段');
    expect(parsed.unknown).toEqual([]);
  });

  it('正文里的两个勾选项都被识别为已确认', () => {
    const parsed = parse(buildFriendIssueBody(input));
    expect(parsed.confirmations).toEqual([...FRIEND_ISSUE_CONFIRMATIONS]);
  });
});

describe('友链 Issue 预填链接', () => {
  const url = buildFriendIssueUrl({ repoUrl: 'https://github.com/ououduck/pldduck/', input });
  const query = new URL(url).searchParams;

  it('不带 template 参数：走表单时 GitHub 会忽略 body', () => {
    expect(url).toContain('https://github.com/ououduck/pldduck/issues/new?');
    expect(query.has('template')).toBe(false);
  });

  it('标题、标签与受理人由参数指定，正文原样带回', () => {
    expect(query.get('title')).toBe('[友链] 阿叶的小站');
    expect(query.get('labels')).toBe('friend-link');
    expect(query.get('assignees')).toBe('ououduck');
    expect(query.get('body')).toBe(buildFriendIssueBody(input));
  });

  it('特殊字符按 query 规则转义，不撕裂参数', () => {
    const tricky = buildFriendIssueUrl({
      repoUrl: 'https://github.com/ououduck/pldduck',
      input: { ...input, description: 'A & B = C? D=E' },
    });
    expect(new URL(tricky).searchParams.get('body')).toContain('A & B = C? D=E');
  });
});

describe('预填内容与 Issue 模板的契约（漂移守卫）', () => {
  const template = yaml.load(
    readFileSync(new URL('../../.github/ISSUE_TEMPLATE/friend-link-application.yml', import.meta.url), 'utf8'),
  ) as { body: TemplateItem[] };
  const items = template.body.filter((item) => item.type !== 'markdown');

  it('段标题与顺序 === FRIEND_FIELDS 的 label', () => {
    expect(Object.values(FRIEND_ISSUE_SECTION_LABELS)).toEqual(FRIEND_FIELDS.map((field) => field.label));
  });

  it('勾选项文案与模板逐字一致', () => {
    const checkbox = items.find((item) => item.type === 'checkboxes');
    expect(checkbox?.attributes?.options?.map((option) => option.label)).toEqual([...FRIEND_ISSUE_CONFIRMATIONS]);
  });
});
