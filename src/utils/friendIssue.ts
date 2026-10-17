/**
 * 友链申请 → 预填 GitHub Issue。
 *
 * 只做一件事：把页面上填的资料拼成 `/issues/new` 的 query，跳转后 Issue 正文即已写好。
 * 正文的段标题与顺序是机器人的解析契约（`scripts/lib/friend-form-core.mjs` 的 `FRIEND_FIELDS`），
 * 这里刻意复刻 GitHub 表单渲染出的样子；两者的一致性由往返测试保证，改任意一边都会变红。
 *
 * 采集面仍然是 GitHub：本页不发送任何请求，也不落任何数据。
 */

export interface FriendApplicationInput {
  name: string;
  url: string;
  backlinkUrl: string;
  avatar: string;
  description: string;
  applicationType: string;
}

/** 各字段的三级标题，须与 Issue 表单的 label 逐字一致。 */
export const FRIEND_ISSUE_SECTION_LABELS = {
  name: '站点名称',
  url: '站点地址',
  backlinkUrl: '反链页面地址',
  avatar: '头像地址',
  description: '站点简介',
  applicationType: '申请类型',
  confirmations: '确认事项',
} as const;

/** 「确认事项」的选项文案，须与 Issue 表单的 checkbox label 逐字一致。 */
export const FRIEND_ISSUE_CONFIRMATIONS = [
  '我已在自己的站点上添加了指向本站的链接，且是服务端直出的 `<a href>`',
  '我同意站点名称、简介、头像与地址在 pldduck.com 公开展示',
] as const;

/** GitHub 表单里未填项渲染成 `_No response_`，保持一致以免解析器看成缺段。 */
const NO_RESPONSE = '_No response_';

/** 输入框是单行的，但仍要压掉换行：正文里的裸换行会打乱分段解析。 */
const singleLine = (value: string) =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();

const section = (label: string, value: string) => `### ${label}\n\n${value || NO_RESPONSE}\n`;

/** 生成 Issue 正文（与 GitHub 表单渲染结果同构）。 */
export const buildFriendIssueBody = (input: FriendApplicationInput): string =>
  [
    section(FRIEND_ISSUE_SECTION_LABELS.name, singleLine(input.name)),
    section(FRIEND_ISSUE_SECTION_LABELS.url, singleLine(input.url)),
    section(FRIEND_ISSUE_SECTION_LABELS.backlinkUrl, singleLine(input.backlinkUrl)),
    section(FRIEND_ISSUE_SECTION_LABELS.avatar, singleLine(input.avatar)),
    section(FRIEND_ISSUE_SECTION_LABELS.description, singleLine(input.description)),
    section(FRIEND_ISSUE_SECTION_LABELS.applicationType, singleLine(input.applicationType)),
    `### ${FRIEND_ISSUE_SECTION_LABELS.confirmations}\n\n${FRIEND_ISSUE_CONFIRMATIONS.map((item) => `- [X] ${item}`).join('\n')}\n`,
  ].join('\n');

export interface FriendIssueUrlOptions {
  /** 仓库地址（`siteConfig.friendsPage.repoUrl`），拼出 `<repo>/issues/new?...`。 */
  repoUrl: string;
  input: FriendApplicationInput;
  labels?: string;
  assignees?: string;
}

/**
 * 拼预填链接。不用 `template=` 参数 —— 走 Issue 表单时 GitHub 会忽略 `body`，
 * 资料填不进正文；直接开空白 Issue 才能把正文带上，标题/标签/受理人仍由参数指定。
 */
export const buildFriendIssueUrl = ({
  repoUrl,
  input,
  labels = 'friend-link',
  assignees = 'ououduck',
}: FriendIssueUrlOptions): string => {
  const query = new URLSearchParams({
    title: `[友链] ${singleLine(input.name) || '未命名站点'}`,
    labels,
    assignees,
    body: buildFriendIssueBody(input),
  });
  return `${repoUrl.replace(/\/+$/, '')}/issues/new?${query.toString()}`;
};
