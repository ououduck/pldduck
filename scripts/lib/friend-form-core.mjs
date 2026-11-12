/**
 * friend-form-core.mjs — 友链 Issue 表单解析与记录校验（纯函数，唯一校验权威）。
 *
 * 为什么需要它：GitHub 的 Issue 表单只有 required 一种校验（正则/长度/URL 校验至今未实现），
 * 表单里的 description 只是提示文本。申请人提交的正文是**完全不可信的用户输入**，会直接被写进
 * friends/*.json 并成为前端 <a href> / <img src>，所以校验收口在这一处，入口脚本只负责编排。
 *
 * 与 ai-rules/friends.md 规则 3/5/11 一一对应；字段 label 是与
 * .github/ISSUE_TEMPLATE/friend-link-application.yml 的契约（有漂移测试守着）。
 */

import { createHash } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { sanitizeLogValue } from './gh-actions-logger.mjs';
import { registrableHost } from './friend-backlink.mjs';

/** 机器人评论的自循环标记：正文含此串的事件一律跳过（见 ai-rules/friends.md 规则 7）。 */
export const FRIEND_ISSUE_MARKER = '<!-- pldduck-friend-bot:v1 -->';

/** 写入目录硬编码：CMS 可改的配置值不能指挥机器人往哪写。 */
export const FRIENDS_DIR = 'friends';

/** 表单字段契约（顺序 = 模板中 inputs 的顺序，label = GitHub 渲染出的三级标题）。 */
export const FRIEND_FIELDS = Object.freeze([
  { label: '站点名称', key: 'name', required: true },
  { label: '站点地址', key: 'url', required: true },
  { label: '反链页面地址', key: 'backlinkUrl', required: false },
  { label: '头像地址', key: 'avatar', required: true },
  { label: '站点简介', key: 'description', required: true },
  { label: '确认事项', key: 'confirmations', required: true },
]);

/**
 * 正文是否长得像一份友链申请：两个必填段的标题同时出现。
 *
 * 为什么需要它：外部申请人没有仓库写权限，GitHub **不会**把预填链接里的
 * `labels=friend-link` 应用到他们创建的空白 Issue 上（2026-11 实测：正文预填成功、
 * 标签却是空的，检测被当成「非友链 Issue」静默跳过）。标签只是便利，正文结构才是契约；
 * 检测结束后机器人会自己补打 friend-link 标签，后续评论重测照旧。
 * @param {string} [body] Issue 正文
 * @returns {boolean}
 */
export const looksLikeFriendApplication = (body) => {
  const text = String(body ?? '');
  return FRIEND_FIELDS.slice(0, 2).every((field) => text.includes(`### ${field.label}`));
};

/** 拒绝文案的联系邮箱：用站点公开邮箱（config/site.config.json 的 social.rawEmail），不掺任何用户输入。 */
export const REJECT_CONTACT_EMAIL = 'pldduck@outlook.com';

// 长度上限导出给模板漂移测试：Issue 表单的 maxLength 必须与这里一致，
// 否则申请人能提交到一半、却在检测评论里收到「过长」，来回改两次。
export const MAX_NAME_CHARS = 50;
export const MAX_DESCRIPTION_CHARS = 120;
export const MAX_URL_CHARS = 500;

/* ------------------------------------------------------------------ */
/* 文本清洗                                                             */
/* ------------------------------------------------------------------ */

// 零宽字符/方向控制/BOM/软连字符：肉眼看不出来，但能让名称冒充别人。
const INVISIBLE_CODE_POINTS = [0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x2028, 0x2029];
const INVISIBLE_CHARACTERS = new RegExp(
  `[${INVISIBLE_CODE_POINTS.map((code) => String.fromCodePoint(code)).join('')}]`,
  'g',
);
// C0/C1 控制字符（不含 \t\n\r，它们由空白折叠处理）。
// eslint-disable-next-line no-control-regex -- 输入净化：有意剔除 C0/C1 控制字符
const CONTROL_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

/** 去不可见字符与控制字符，再把连续空白压成单个空格并 trim。 */
const cleanInline = (value) =>
  String(value ?? '')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim();

const codePointLength = (value) => [...value].length;

/* ------------------------------------------------------------------ */
/* URL 校验与归一化                                                      */
/* ------------------------------------------------------------------ */

/**
 * 校验单个 URL 字段（协议白名单 + 凭据 / IP 字面量 / 长度）。
 * @param {string} raw 候选值
 * @param {string} label 出错信息里显示的字段名
 * @returns {{ error?: string, url?: URL }}
 */
const checkUrlField = (raw, label) => {
  const value = cleanInline(raw);
  if (!value) return { error: `${label} 不能为空` };
  if (value.length > MAX_URL_CHARS) return { error: `${label} 过长（上限 ${MAX_URL_CHARS} 字符）` };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: `${label} 不是合法地址` };
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: `${label} 只允许 http/https（收到 ${url.protocol}）` };
  }
  if (url.username || url.password) return { error: `${label} 不允许包含账号信息` };
  if (!url.hostname) return { error: `${label} 缺少域名` };
  if (net.isIP(url.hostname) !== 0) return { error: `${label} 不允许直接使用 IP 地址` };
  return { url };
};

/**
 * 归一化站点地址用于去重：scheme/host 小写、去 www.、去末尾斜杠、去默认端口。
 * 生成器只按原始 trim 串去重，机器人必须比它严，否则 https://blog.A.com 与
 * https://blog.a.com/ 会变成两张卡。
 * @param {string} value
 * @returns {string}
 */
export const normalizeFriendUrl = (value) => {
  const cleaned = cleanInline(value);
  let url;
  try {
    url = new URL(cleaned);
  } catch {
    return cleaned.toLowerCase();
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = url.pathname.replace(/\/+$/, '');
  const port = url.port && url.port !== (url.protocol === 'https:' ? '443' : '80') ? `:${url.port}` : '';
  return `${url.protocol.toLowerCase()}//${hostname}${port}${pathname}${url.search}${url.hash}`;
};

/* ------------------------------------------------------------------ */
/* Issue 正文解析                                                       */
/* ------------------------------------------------------------------ */

const HEADING = /^###\s+(.+?)\s*$/;
const CHECKBOX = /^\s*[-*+]\s*\[([ xX])\]\s*(.*)$/;
const NO_RESPONSE = '_No response_';

/**
 * 把 Issue 正文按 `### <label>` 切成段。
 *
 * 契约：fields 里每个 label 必须**出现且仅出现一次**，且相对顺序与模板一致；
 * 未知标题（模板说明块、将来新增字段）忽略。任何违反都判失败 —— 宁可转人工，
 * 也绝不猜字段值（猜错就是把 A 站的信息登成 B 站）。
 *
 * @param {string} body Issue 正文
 * @param {Array<{label: string, key: string}>} [fields]
 * @returns {{ok: boolean, reason?: string, values?: Record<string, string>, confirmations?: string[], unknown?: string[]}}
 */
export const parseFriendIssueBody = (body, fields = FRIEND_FIELDS) => {
  const lines = String(body ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match) headings.push({ label: match[1].trim(), index });
  });

  const segments = headings.map((heading, position) => {
    const start = heading.index + 1;
    const end = position + 1 < headings.length ? headings[position + 1].index : lines.length;
    return {
      label: heading.label,
      // GitHub 对未填项渲染 '_No response_'，与空值同义。
      value: lines
        .slice(start, end)
        .join('\n')
        .trim()
        .replace(/^_No response_$/m, '')
        .trim(),
    };
  });

  const values = {};
  const confirmations = [];
  let previousIndex = -1;
  for (const field of fields) {
    const matched = segments.filter((segment) => segment.label === field.label);
    if (matched.length === 0) {
      return { ok: false, reason: `表单缺少「${field.label}」段，可能不是用模板提交的` };
    }
    if (matched.length > 1) {
      return { ok: false, reason: `表单里「${field.label}」出现 ${matched.length} 次，无法判定取哪一段` };
    }
    const index = headings.findIndex((heading) => heading.label === field.label);
    if (index <= previousIndex) {
      return { ok: false, reason: `表单字段顺序与模板不一致（「${field.label}」位置异常）` };
    }
    previousIndex = index;
    values[field.key] = matched[0].value;
    if (field.key === 'confirmations') {
      for (const line of matched[0].value.split('\n')) {
        const box = CHECKBOX.exec(line);
        if (!box) continue;
        if (box[1].toLowerCase() !== 'x') {
          return { ok: false, reason: `确认事项里有未勾选的项：${cleanInline(box[2]).slice(0, 60)}` };
        }
        confirmations.push(cleanInline(box[2]));
      }
      if (confirmations.length === 0) {
        return { ok: false, reason: '确认事项里没有找到任何勾选项，无法确认你已添加本站链接' };
      }
    }
  }

  const matchedLabels = new Set(fields.map((field) => field.label));
  const unknown = headings.filter((heading) => !matchedLabels.has(heading.label)).map((heading) => heading.label);

  return { ok: true, values, confirmations, unknown };
};

/* ------------------------------------------------------------------ */
/* 记录校验                                                             */
/* ------------------------------------------------------------------ */

/**
 * 校验并归一化一条友链记录（唯一权威：入口脚本写文件前必须过这里）。
 * @param {Record<string, string>} values parseFriendIssueBody 的 values
 * @param {object} [options]
 * @param {ReadonlySet<string>} [options.acceptedHosts] 本站域名（禁止把本站自己申请成友链）
 * @returns {{ok: boolean, errors: string[], record?: {name: string, description: string, avatar: string, url: string}, canonicalUrl?: string, backlinkUrl?: string}}
 */
export const validateFriendRecord = (values = {}, { acceptedHosts = new Set() } = {}) => {
  const errors = [];
  const name = cleanInline(values.name);
  const description = cleanInline(values.description);
  if (!name) errors.push('站点名称不能为空');
  else if (codePointLength(name) > MAX_NAME_CHARS) errors.push(`站点名称过长（上限 ${MAX_NAME_CHARS} 字）`);
  if (!description) errors.push('站点简介不能为空');
  else if (codePointLength(description) > MAX_DESCRIPTION_CHARS) {
    errors.push(`站点简介过长（上限 ${MAX_DESCRIPTION_CHARS} 字）`);
  }

  const urlCheck = checkUrlField(values.url, '站点地址');
  if (urlCheck.error) errors.push(urlCheck.error);
  const avatarCheck = checkUrlField(values.avatar, '头像地址');
  if (avatarCheck.error) errors.push(avatarCheck.error);

  // 反链页面是申请人任意填写的 URL，必须锁在申报站点同域内 —— 否则本 Action 就成了
  // 替别人探测内网/任意主机的通用抓取器。
  let backlinkUrl = '';
  const rawBacklink = cleanInline(values.backlinkUrl);
  if (rawBacklink && rawBacklink !== NO_RESPONSE) {
    const backlinkCheck = checkUrlField(rawBacklink, '反链页面地址');
    if (backlinkCheck.error) {
      errors.push(backlinkCheck.error);
    } else if (urlCheck.url) {
      const pageHost = registrableHost(backlinkCheck.url.hostname);
      const siteHost = registrableHost(urlCheck.url.hostname);
      const sameFamily =
        pageHost === siteHost || pageHost.endsWith(`.${siteHost}`) || siteHost.endsWith(`.${pageHost}`);
      if (!sameFamily) {
        errors.push(`反链页面地址必须与站点地址同域（页面 ${pageHost} / 站点 ${siteHost}）`);
      } else if (backlinkCheck.url.port) {
        errors.push('反链页面地址不允许使用非标准端口');
      } else {
        backlinkUrl = cleanInline(rawBacklink);
      }
    }
  }

  if (urlCheck.url) {
    const host = registrableHost(urlCheck.url.hostname);
    if ([...acceptedHosts].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      errors.push('站点地址不能是本站域名');
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const url = cleanInline(values.url);
  return {
    ok: true,
    errors: [],
    record: { name, description, avatar: cleanInline(values.avatar), url },
    canonicalUrl: normalizeFriendUrl(url),
    backlinkUrl,
  };
};

/* ------------------------------------------------------------------ */
/* 文件名与 JSON 产物                                                    */
/* ------------------------------------------------------------------ */

const FILENAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 把任意文本缩成 ASCII slug（只留字母数字与 -_，其余折叠为短横线）。 */
const slugifyAscii = (value) =>
  cleanInline(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

const assertFriendlyPath = (filename) => {
  const filePath = `${FRIENDS_DIR}/${filename}.json`;
  if (!FILENAME_PATTERN.test(filename)) throw new Error(`文件名不合法：${filename}`);
  // 归一化后必须原样落在 friends/ 下：挡掉 ..、/、\、NUL 等一切穿越写法。
  if (path.posix.normalize(`${FRIENDS_DIR}/${filename}.json`) !== filePath) {
    throw new Error(`文件名会改变写入路径：${filename}`);
  }
  return filePath;
};

/**
 * 派生文件名：**只从 issue.user.login 出发**（GitHub 已限 [A-Za-z0-9-]{1,39}，
 * 与现有 ayeez / YILXIY-blog 风格一致），正文里的任何文本都不参与。
 * 撞名加站点 host 后缀，再撞退到 url 的 sha256 前 8 位。
 * @param {string} login 提交 Issue 的 GitHub 用户名
 * @param {string} url 申报的站点地址
 * @param {Iterable<string>} [existing] 已存在的文件名（不含 .json）
 * @returns {string}
 */
export const suggestFilename = (login, url, existing = []) => {
  const taken = new Set([...existing]);
  const base = slugifyAscii(login);
  if (!base) throw new Error('无法从提交者用户名派生合法文件名，请人工录入');
  let candidate = base.slice(0, 64);
  if (taken.has(candidate)) {
    const hostStem = slugifyAscii(registrableHost(new URL(cleanInline(url)).hostname)).slice(0, 20);
    candidate = `${base}-${hostStem}`.slice(0, 64).replace(/-+$/g, '');
  }
  if (taken.has(candidate) || !candidate) {
    candidate =
      `${base}-${createHash('sha256').update(cleanInline(url).toLowerCase()).digest('hex').slice(0, 8)}`.slice(0, 64);
  }
  assertFriendlyPath(candidate);
  return candidate;
};

/**
 * 生成 friends/<filename>.json 的正文（与 Pages CMS 现有 14 个文件同形状）。
 *
 * 必须写 filename 键：生成器把它当未知字段丢掉，但缺了它 Pages CMS 的
 * {fields.filename}.json 模板会把条目存成 ".json"（回归见 pagescms-config.test.mjs）。
 * 结尾不加换行：Pages CMS 写出的现有文件就没有尾换行，保持一致以免 diff 噪声。
 * @param {object} input
 * @param {{name: string, description: string, avatar: string, url: string}} input.record
 * @param {string} input.filename
 * @param {boolean} [input.unavailable] 更新时必须透传原值，机器人不许重置站长标记
 * @returns {string}
 */
export const buildRecordJson = ({ record, filename, unavailable = false }) => {
  assertFriendlyPath(filename);
  return JSON.stringify(
    {
      name: record.name,
      filename,
      description: record.description,
      avatar: record.avatar,
      url: record.url,
      unavailable: unavailable === true,
    },
    null,
    2,
  );
};

/**
 * 合并更新：展示字段取本次申报值，`unavailable` 透传原值（机器人永远不许重置站长标记），
 * 其余未知键不保留 —— 产物一律是 canonical 六键形状，避免旧文件里的脏键被重新发布。
 * @param {object} original 现有 JSON 解析结果
 * @param {object} record 新记录
 * @param {string} filename
 * @returns {string}
 */
export const mergeRecordJson = (original, record, filename) =>
  buildRecordJson({
    record,
    filename,
    unavailable: original?.unavailable === true,
  });

/**
 * 只翻 `unavailable` 一个键，展示字段原样透传（失联巡检专用）。
 *
 * 不删键、不改键序：现有 14 个文件都带 `unavailable`，生成器把缺失当 false
 * （generate-site-data.mjs），但 Pages CMS 的表单模板按键存在与否渲染，
 * 少写一个键就是一次无谓的 diff。值已一致的比较交给调用方做，本函数总是重新序列化。
 * @param {object} original 现有 JSON 解析结果
 * @param {boolean} unavailable
 * @returns {string}
 */
export const withUnavailable = (original, unavailable) => {
  // 不能只靠 assertFriendlyPath：字符串 "undefined" 恰好是合法文件名，
  // 缺键的记录会静默写出 friends/undefined.json。
  if (typeof original?.filename !== 'string' || original.filename === '') {
    throw new Error('记录缺 filename 键，拒绝序列化');
  }
  return buildRecordJson({
    record: original,
    filename: original.filename,
    unavailable: unavailable === true,
  });
};

/* ------------------------------------------------------------------ */
/* Issue 评论渲染                                                       */
/* ------------------------------------------------------------------ */

/** 展示用户文本：一律进行内代码，防止在评论里拼出链接/HTML/标题。 */
const inlineCode = (value) => {
  const safe = sanitizeLogValue(cleanInline(value)).slice(0, 200) || '(空)';
  const fence = safe.includes('`') ? '``' : '`';
  const pad = safe.startsWith('`') || safe.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${safe}${pad}${fence}`;
};

const renderSection = (title, rows) => {
  const lines = [`#### ${title}`, ''];
  for (const [key, value] of rows) {
    if (value === undefined || value === null || value === '') continue;
    lines.push(`- ${key}：${value}`);
  }
  return lines.join('\n');
};

const FOOTER = [
  '',
  '---',
  '',
  '*由 GitHub Actions 自动发布。检测全部通过会自动收录并关闭本 Issue；没通过则转站长人工处理（打上 `friend-approved` 标签即入库）。*',
].join('\n');

/**
 * 黑名单拦截评论的页脚：不能带「打 friend-approved 即入库」那句 —— 黑名单命中的
 * 申请连人工放行都会被拦（要先从 CMS 黑名单移除），给申请人这个提示只会误导。
 */
const BLACKLIST_FOOTER = ['', '---', '', '*由 GitHub Actions 自动发布。*'].join('\n');

/**
 * 组装机器人评论（统一带自循环标记与页脚）。
 * @param {object} input
 * @param {string} input.title 一级标题
 * @param {string[]} [input.paragraphs] 普通段落
 * @param {Array<[string, string][]>} [input.sections] `[小标题, [[键, 值]]` 列表
 * @param {string} [input.note] 结尾补充（已含 markdown）
 * @param {string} [input.footer] 页脚（默认 FOOTER）
 * @returns {string}
 */
export const renderComment = ({ title, paragraphs = [], sections = [], note = '', footer = FOOTER }) => {
  const blocks = [
    FRIEND_ISSUE_MARKER,
    '',
    `## ${sanitizeLogValue(title)}`,
    '',
    ...paragraphs.filter(Boolean).map((paragraph) => `${paragraph}\n`),
    ...sections.map(([sectionTitle, rows]) => `${renderSection(sectionTitle, rows)}\n`),
  ];
  if (note) blocks.push(note, '');
  blocks.push(footer);
  return blocks.join('\n');
};

/** 记录展示段（名称/地址/简介/头像/文件名）。 */
const recordRows = (record, { backlinkUrl, filename } = {}) => [
  ['站点名称', inlineCode(record.name)],
  ['站点地址', inlineCode(record.url)],
  ['反链页面', inlineCode(backlinkUrl || '未填，按站点首页检测')],
  ['站点简介', inlineCode(record.description)],
  ['头像地址', inlineCode(record.avatar)],
  ['拟用文件名', inlineCode(filename || '（待定）')],
];

/** 检测证据段。 */
const detectionRows = (result) => {
  if (!result) return [['检测', '未执行']];
  const stats = result.stats ?? {};
  return [
    ['结论', inlineCode(result.verdict)],
    ['说明', result.message ? sanitizeLogValue(result.message) : ''],
    // 证据来源必须写清楚：静态抓取与无头浏览器渲染的覆盖面不同，站长看证据时要知道是哪一种。
    ['检测方式', stats.rendered ? '浏览器渲染（含 JS 挂件）' : '静态 HTML'],
    ['链接数', stats.anchorCount === undefined ? '' : String(stats.anchorCount)],
    ['渲染的 frame 数', stats.frames ? String(stats.frames) : ''],
    ['页面出现的域名', stats.sampleHosts?.length ? inlineCode(stats.sampleHosts.join(', ')) : ''],
    ['落地域名', inlineCode(stats.landedHost ?? '')],
    ['响应体被截断', stats.truncated ? '是（页脚可能没读到）' : '否'],
  ];
};

/**
 * 检测阶段评论：只给证据，不写文件。
 * @param {object} input
 * @param {object} [input.validated] validateFriendRecord 结果（解析失败时走 renderBlockedComment，不进这里）
 * @param {string} [input.filename]
 * @param {object} [input.result] findBacklink / buildTransportVerdict 结果
 * @param {string} input.siteUrl 本站地址（给申请人抄的规范写法）
 * @returns {string}
 */
export const renderDetectComment = ({ validated, filename, result, siteUrl }) => {
  const record = validated?.record;
  const hit = result?.verdict === 'found';
  return renderComment({
    title: hit ? '反链检测：已看到链接，等待站长确认' : '反链检测：暂未见链接（或无法判定），等待站长确认',
    paragraphs: [
      hit
        ? `已在你的页面上检测到指向本站的链接。**检测全部通过会自动收录并关闭本 Issue**；其他环节没通过时才会转站长人工确认。`
        : `这次**没有**可靠地检测到指向本站的静态链接：${result?.message ?? '检测未完成'}`,
      hit
        ? ''
        : [
            '请检查以下几点后修改本 Issue 的正文（或在本 Issue 下评论一句，检测会自动重跑）：',
            '',
            `1. 链接可以是 JS 渲染的（机器人会用无头浏览器再查一次）；服务端直出的 \`<a href="${siteUrl}">\` 仍然最稳 —— 加载慢、被墙或被站点反爬拦截时仍可能漏检。`,
            '2. 只认 `<a href>`：图片、RSS、`rel=canonical`、跳转都不算。',
            '3. 常见的挂链位置：首页页脚、友情链接/friends 单独页、关于页。',
            '',
            '如果你确实已经挂好了，也可以直接等站长人工确认 —— 检测通过会自动收录，没通过才转人工。',
          ].join('\n'),
    ],
    sections: [
      ['申报信息', recordRows(record ?? {}, { ...validated, filename })],
      ['反链检测', detectionRows(result)],
    ].filter(([, rows]) => rows.length > 0),
    note: filename ? `拟写入文件：\`${FRIENDS_DIR}/${filename}.json\`（仅在人工放行后写入）。` : '',
  });
};

/**
 * 收录评论（自动收录与人工放行共用；含 commit sha 与部署状态）。
 * @param {object} input
 * @param {object} input.record
 * @param {string} input.filename
 * @param {string} input.commitSha 写入后的 commit sha
 * @param {object} [input.result] 检测证据（自动收录时就是本次命中的结果）
 * @param {boolean} [input.deployed] 是否已成功触发 deploy.yml
 * @param {string} [input.backlinkUrl] 申报的反链页面
 * @param {boolean} [input.auto] 是否由「全部检测通过」自动收录（2026-11 用户授权）
 * @returns {string}
 */
export const renderApprovedComment = ({
  record,
  filename,
  commitSha,
  result,
  deployed = true,
  backlinkUrl = '',
  auto = false,
}) =>
  renderComment({
    title: auto ? '已收录：自动检测全部通过，友链文件已写入' : '已收录：站长审核通过，友链文件已写入',
    paragraphs: [
      auto
        ? `表单、站点与头像的可达性、反链检测全部通过，本条友链已自动写入 \`${FRIENDS_DIR}/${filename}.json\`（commit \`${String(commitSha ?? '').slice(0, 7)}\`）。`
        : `站长已人工确认，本条友链写入 \`${FRIENDS_DIR}/${filename}.json\`（commit \`${String(commitSha ?? '').slice(0, 7)}\`）。`,
      auto
        ? '反链检测命中，证据见下；本 Issue 已自动关闭。'
        : result?.verdict === 'found'
          ? `反链检测同时命中，证据见下。`
          : `注意：自动反链检测**未**命中（${result?.message ?? '未执行'}），本条为人工放行。`,
      deployed
        ? '已自动触发 `Deploy to Cloudflare Worker`，站点要等那次运行跑完才会更新（不是立刻生效）。'
        : '⚠️ 自动触发部署失败，请到 Actions 手动运行 `Deploy to Cloudflare Worker`。',
    ],
    sections: [
      ['入库信息', recordRows(record, { filename, backlinkUrl })],
      ['最后一次检测', detectionRows(result)],
    ],
  });

/**
 * 黑名单拦截评论：固定文案，不回显匹配规则，只回显命中的主机名。
 * 黑名单命中的申请连人工放行都会被拦（要先从 CMS 移除），所以不能带「打标签即入库」的页脚。
 * @param {object} input
 * @param {string} input.url 命中的地址（站点/反链页/头像）
 * @returns {string}
 */
export const renderBlacklistedComment = ({ url }) => {
  let host = String(url ?? '');
  try {
    host = new URL(host).hostname;
  } catch {
    // 不是合法 URL 时原样展示（调用方传进来的通常是 URL，这里只是兜底）。
  }
  return renderComment({
    title: '申请未通过：站点在友链黑名单中',
    paragraphs: [
      `申报的站点或资源地址（${inlineCode(host)}）已在本站的友链黑名单中，本流程不会收录该站点。`,
      `如果你认为这是误判，欢迎邮件联系 ${REJECT_CONTACT_EMAIL}。`,
    ],
    note: '本 Issue 已关闭。黑名单调整后重开本 Issue 会重新检测。',
    footer: BLACKLIST_FOOTER,
  });
};

/** 站点无法访问时的固定话术（站长指定，逐字保留）。 */
export const UNREACHABLE_NOTICE =
  '你的网站经自动检测无法正常访问，如果开启了禁海外，请关闭，否则将影响后续验证和检测，不予通过。';

/** 站点能访问、只有头像打不开时换这句（否则会误告「网站打不开」）。 */
export const AVATAR_UNREACHABLE_NOTICE =
  '你的网站可以正常访问，但**头像地址**经自动检测拿不到图片。请把头像换成公开可直链访问的图片地址（同样不要屏蔽海外）。';

/**
 * 可达性检查失败 → 转人工审核的评论（2026-11 用户授权：不再自动关闭）。
 * 站点/头像在境外打不开只是「自动流程走不下去」，最终收不收由站长决定。
 * @param {object} input
 * @param {{url: string, reachable: boolean, reason: string}} [input.site] 站点地址检查结果
 * @param {{url: string, reachable: boolean, reason: string}} [input.avatar] 头像地址检查结果
 * @returns {string}
 */
export const renderUnreachableComment = ({ site, avatar }) => {
  const describe = (check) => `${inlineCode(check.url)} → ${sanitizeLogValue(check.reason)}`;
  const rows = [];
  if (site) rows.push(['站点地址', describe(site)]);
  if (avatar) rows.push(['头像地址', describe(avatar)]);
  return renderComment({
    title: '自动检测：站点或头像无法访问，需人工确认',
    paragraphs: [
      site && !site.reachable ? UNREACHABLE_NOTICE : '',
      site && site.reachable && avatar && !avatar.reachable ? AVATAR_UNREACHABLE_NOTICE : '',
      '检测运行在境外的 GitHub Actions 上：从你本地能打开不代表这里能打开，防火墙丢弃、连接超时、CDN 返回 403 都会被判定为无法访问。',
    ],
    sections: rows.length > 0 ? [['访问检查', rows]] : [],
    note: '本 Issue **保持开启**，等站长人工确认：确认可以收录就打 `friend-approved` 标签，决定不收就直接关闭本 Issue。解除屏蔽后**重开本 Issue** 会立刻重新检测。',
  });
};

/**
 * 无法处理（解析失败/校验失败/需要人工）时的评论。
 * @param {object} input
 * @param {string} input.title 小标题
 * @param {string[]} [input.reasons] 原因列表（调用方负责已净化或纯文本）
 * @param {string} [input.next] 给申请人的下一步
 * @returns {string}
 */
export const renderBlockedComment = ({ title, reasons = [], next = '' }) =>
  renderComment({
    title: `暂时无法自动处理：${sanitizeLogValue(title)}`,
    paragraphs: [
      reasons
        .filter(Boolean)
        .map((reason) => `- ${reason}`)
        .join('\n'),
      next || '请修改本 Issue 的正文后重新提交检测（在本 Issue 下评论一句即可重跑）。',
    ],
  });

/** 判定本次要抓的页面地址：反链页面优先，否则站点首页。 */
export const pickDetectionUrl = (validated) => validated?.backlinkUrl || validated?.record?.url || '';
