/**
 * friend-blacklist.mjs — 友链黑名单匹配（纯函数，不碰网络）。
 *
 * 用途：站长在 Pages CMS 的「友链黑名单」里维护域名，命中任一域名的申请
 * **不自动收录、也不进人工审核**（2026-11 用户授权，用于挡恶意自动通过）。
 *
 * 匹配口径（与 ai-rules/friends.md 的「友链黑名单」一节一一对应）：
 *   - 大小写不敏感；条目可以是域名，也可以贴完整 URL（自动取主机名、去掉端口/路径）；
 *   - `example.com`     → 精确匹配 + 所有子域（`a.example.com`、`a.b.example.com`）；
 *   - `*.example.com`   → 只匹配子域（至少一级），不匹配裸域 `example.com`；
 *   - 其它位置出现 `*`、空条目、单标签域名（如 `localhost`）一律视为无效条目并忽略；
 *   - 支持国际化域名：条目会转 punycode 后再与 URL 解析出的主机名比较。
 *
 * 为什么条目也接受完整 URL：CMS 里复制粘贴站点地址比手抠主机名不容易填错；
 * 但匹配永远只针对主机名，路径/查询参数不参与。
 */

import fs from 'node:fs';
import path from 'node:path';
import { domainToASCII } from 'node:url';

/** 黑名单配置文件（Pages CMS 的「友链黑名单」集合直接编辑它）。 */
export const FRIEND_BLACKLIST_PATH = 'config/friend-blacklist.json';

/** 去掉协议、路径、查询串与端口，只留主机名；小写、去尾点、去 IPv6 方括号。 */
export const extractBlacklistHost = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[(.*)\]$/, '$1');
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 把国际化域名转 punycode；转换失败时原样返回（交给后续校验丢弃）。 */
const toAsciiHost = (host) => {
  const ascii = domainToASCII(host);
  return ascii || host;
};

/**
 * 编译一条黑名单规则。
 * @param {string} raw CMS 里的原始条目
 * @returns {{ source: string, subdomainOnly: boolean, regex: RegExp } | null} 无效条目返回 null
 */
export const compileBlacklistPattern = (raw) => {
  const source = String(raw ?? '').trim();
  if (!source) return null;

  let host = extractBlacklistHost(source);
  if (!host || host === '*') return null;

  const subdomainOnly = host.startsWith('*.');
  if (subdomainOnly) host = host.slice(2);
  // 只支持 `*.` 前缀这一种通配；其它位置的 `*` 无法安全解释，直接判无效。
  if (!host || host.includes('*')) return null;
  // 单标签主机（localhost 之类）黑名单没有意义，也挡住误填。
  if (!host.includes('.')) return null;

  const ascii = toAsciiHost(host);
  if (!ascii.includes('.')) return null;

  const body = subdomainOnly ? `(?:[^.]+\\.)+${escapeRegExp(ascii)}` : `(?:[^.]+\\.)*${escapeRegExp(ascii)}`;
  return { source, subdomainOnly, regex: new RegExp(`^${body}$`, 'i') };
};

/**
 * 判断一个主机名/URL 是否命中黑名单。
 * @param {string} hostOrUrl 申报的站点地址、反链页面或头像地址（任意 URL 均可）
 * @param {Array<{ regex: RegExp }>} patterns compileBlacklistPattern / loadFriendBlacklist 的产物
 * @returns {{ source: string } | null} 命中的规则
 */
export const isBlacklistedHost = (hostOrUrl, patterns) => {
  const host = extractBlacklistHost(hostOrUrl);
  if (!host) return null;
  const ascii = toAsciiHost(host);
  for (const pattern of patterns ?? []) {
    if (pattern.regex.test(ascii) || (ascii !== host && pattern.regex.test(host))) {
      return { source: pattern.source };
    }
  }
  return null;
};

/**
 * 在一组 URL 里找第一个命中黑名单的地址（站点地址、反链页面、头像都会检查，
 * 防止用「申报 A 站、反链挂在被拉黑的 B 站」绕过）。
 * @param {Array<string | undefined>} urls
 * @param {Array<{ regex: RegExp }>} patterns
 * @returns {{ url: string, host: string, source: string } | null}
 */
export const findBlacklistHit = (urls, patterns) => {
  for (const url of urls ?? []) {
    const hit = isBlacklistedHost(url, patterns);
    if (hit) return { url: String(url), host: extractBlacklistHost(url), source: hit.source };
  }
  return null;
};

/**
 * 读取并编译黑名单配置。
 *
 * 读不到/解析失败时返回 `{ error }` 而不是抛错：调用方会把「配置坏了」当作需要人工处理，
 * 既不静默放行（危险），也不让整个 workflow 崩掉（申请人看不到任何反馈）。
 *
 * @param {{ rootDir: string }} input
 * @returns {{ patterns: Array<object>, invalid: number, error: string | null }}
 */
export const loadFriendBlacklist = ({ rootDir }) => {
  const filePath = path.join(rootDir, FRIEND_BLACKLIST_PATH);
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { patterns: [], invalid: 0, error: `读取 ${FRIEND_BLACKLIST_PATH} 失败：${error.message}` };
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { patterns: [], invalid: 0, error: `${FRIEND_BLACKLIST_PATH} 不是合法 JSON：${error.message}` };
  }

  const domains = Array.isArray(data?.domains) ? data.domains : [];
  const compiled = domains.map((item) => compileBlacklistPattern(item));
  const patterns = compiled.filter(Boolean);
  return { patterns, invalid: compiled.length - patterns.length, error: null };
};
