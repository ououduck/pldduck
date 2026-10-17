/**
 * friend-backlink.mjs — 友链反链判定（纯函数，不碰网络）。
 *
 * 判定口径与 ai-rules/friends.md 规则 4 一一对应，改动必须同步那份规则：
 *   - 只认 <a href> 解析出的绝对 http(s) 地址，host 精确等于或为子域于本站域名；
 *   - 判定前剥离 HTML 注释（主题里注释掉的友链是最可能的假阳性来源）；
 *   - 落地 host ≠ 申报 host 判 offsite（防「把域名 301 到本站」骗过检测）；
 *   - 页面上一个静态 <a> 都没有 → js-only（JS 渲染的挂件，静态抓取看不到）。
 *
 * 结论只是**审核参考证据**：入库与否由站长打标签决定，本模块不参与任何放行判断。
 */

/** 判定结果枚举（restricted / fetch-error 由传输层产生，见 buildTransportVerdict）。 */
export const BACKLINK_VERDICTS = Object.freeze({
  FOUND: 'found',
  NOT_FOUND: 'not-found',
  OFFSITE: 'offsite',
  JS_ONLY: 'js-only',
  RESTRICTED: 'restricted',
  FETCH_ERROR: 'fetch-error',
});

/** 服务器已响应但限制自动化访问：可达，但拿不到证据（≠ 没挂链）。 */
export const RESTRICTED_STATUS_CODES = new Set([401, 403, 405, 406, 407, 429]);

/**
 * 归一化主机名：小写、去尾点、去 IPv6 方括号、去前导 www.。
 * @param {string} hostname
 * @returns {string}
 */
export const registrableHost = (hostname) => {
  const value = String(hostname ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  const withoutBrackets = value.replace(/^\[(.*)\]$/, '$1');
  return withoutBrackets.startsWith('www.') ? withoutBrackets.slice(4) : withoutBrackets;
};

/** host 是否等于 domain 或为其子域（点边界匹配，pldduck.com.evil.net 不算）。 */
const isSameOrSubHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** 锚点主机是否算作本站反链（两侧都先归一化：www 前缀与大小写不影响判定）。 */
const isBacklinkHost = (hostname, acceptedHosts) => {
  const host = registrableHost(hostname);
  if (!host) return false;
  for (const domain of acceptedHosts) {
    if (isSameOrSubHost(host, domain)) return true;
  }
  return false;
};

/**
 * 由本站地址构造「算作反链」的主机集合（已归一化）。
 * @param {string} siteUrl 站点地址（config/site.config.json 的 url）
 * @returns {ReadonlySet<string>}
 */
export const buildAcceptedHosts = (siteUrl) => {
  let host = '';
  try {
    host = new URL(String(siteUrl)).hostname;
  } catch {
    throw new TypeError(`无法解析站点地址：${String(siteUrl)}`);
  }
  const normalized = registrableHost(host);
  if (!normalized) throw new TypeError(`站点地址缺少主机名：${String(siteUrl)}`);
  return new Set([normalized]);
};

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** 只解链接属性需要的那几个实体（含十进制/十六进制数字实体），其余原样保留。 */
const decodeHrefEntities = (value) =>
  String(value).replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#[xX][0-9a-f]+);/g, (entity) => {
    if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];
    const digits = entity.slice(2, -1);
    const code = digits[0] === '#' ? Number.parseInt(digits.slice(1), 16) : Number(digits);
    if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(code);
    } catch {
      return entity;
    }
  });

const ANCHOR_OPEN_TAG = /<a\b[^>]*>/gi;
const HREF_ATTRIBUTE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

/** 取锚点可见文本：从开标签往后找到 </a>，剥掉内层标签并压缩空白（找不到就只取一小段）。 */
const readAnchorText = (html, tagEnd) => {
  // 必须带边界：indexOf('</a') 会把 </article> 当成本锚点的闭合标签。
  const rest = html.slice(tagEnd);
  const closeMatch = /<\/a[\s>]/i.exec(rest);
  const raw = closeMatch ? rest.slice(0, closeMatch.index) : rest.slice(0, 200);
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return decodeHrefEntities(text);
};

/**
 * 提取页面里全部静态锚点的绝对地址（http/https，按 url 去重）。
 * javascript:/data:/mailto: 与解析失败的 href 一律丢弃；相对地址按 baseUrl 解析。
 * @param {string} html
 * @param {string} baseUrl 该 HTML 的实际地址（用于解析相对链接与协议相对链接）
 * @returns {Array<{ url: string, text: string }>}
 */
export const extractAnchorUrls = (html, baseUrl) => {
  const source = String(html ?? '').replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
  const anchors = [];
  const seen = new Set();
  let base;
  try {
    base = new URL(String(baseUrl));
  } catch {
    return anchors;
  }
  // lastIndex 由调用方持有：同一正则对象跨页复用会带着上次的偏移（'g' 标志的隐式状态）。
  ANCHOR_OPEN_TAG.lastIndex = 0;
  let match;
  while ((match = ANCHOR_OPEN_TAG.exec(source)) !== null) {
    const [tag] = match;
    const attributeMatch = HREF_ATTRIBUTE.exec(tag);
    if (!attributeMatch) continue;
    const rawHref = attributeMatch[1] ?? attributeMatch[2] ?? attributeMatch[3] ?? '';
    const href = decodeHrefEntities(rawHref.trim());
    if (!href) continue;
    let resolved;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(resolved.protocol)) continue;
    const url = resolved.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    anchors.push({ url, text: readAnchorText(source, match.index + tag.length) });
  }
  return anchors;
};

const FALLBACK_CHARSET = 'utf-8';

/** 从 Content-Type 头里取 charset 值；没有返回空串。 */
const extractHeaderCharset = (contentType) => {
  const match = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(String(contentType ?? ''));
  return match ? match[1] : '';
};

const decodeLatin1 = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let index = 0; index < view.length; index += 1) out += String.fromCharCode(view[index]);
  return out;
};

/** 前 2048 字节按 latin-1 嗅 <meta charset> / <meta http-equiv content-type>（避免依赖解码结果）。 */
const sniffMetaCharset = (bytes) => {
  const head = decodeLatin1(bytes.subarray(0, 2048));
  const meta =
    head.match(/<meta\b[^>]*\bcharset\s*=\s*["']?\s*([\w-]+)/i) ||
    head.match(/<meta\b[^>]*\bcontent\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i);
  return meta ? meta[1] : '';
};

const decodeWith = (bytes, label) => {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    // 未知/非法 label（TextDecoder 构造即抛 RangeError）：回退 utf-8，绝不让作业崩。
    return new TextDecoder(FALLBACK_CHARSET, { fatal: false }).decode(bytes);
  }
};

/**
 * 按 BOM → Content-Type charset → <meta charset> → utf-8 的优先级把字节解成文本。
 * 博客圈仍有 GBK/Big5 站点，硬按 utf-8 解会得到一片 U+FFFD，链接文本与判定都会失真。
 * @param {Uint8Array} bytes
 * @param {string} [contentType] 响应头的 Content-Type 原值
 * @returns {{ text: string, charset: string }}
 */
export const decodeHtmlBytes = (bytes, contentType = '') => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (view.length === 0) return { text: '', charset: FALLBACK_CHARSET };
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return { text: decodeWith(view.subarray(3), 'utf-8'), charset: 'utf-8 (BOM)' };
  }
  if (view[0] === 0xff && view[1] === 0xfe) {
    return { text: decodeWith(view.subarray(2), 'utf-16le'), charset: 'utf-16 (BOM)' };
  }
  if (view[0] === 0xfe && view[1] === 0xff) {
    return { text: decodeWith(view.subarray(2), 'utf-16be'), charset: 'utf-16 (BOM)' };
  }
  const headerCharset = extractHeaderCharset(contentType);
  if (headerCharset) return { text: decodeWith(view, headerCharset), charset: headerCharset };
  const metaCharset = sniffMetaCharset(view);
  if (metaCharset) return { text: decodeWith(view, metaCharset), charset: metaCharset };
  return { text: decodeWith(view, FALLBACK_CHARSET), charset: FALLBACK_CHARSET };
};

/**
 * 静态页面反链判定。
 * @param {object} input
 * @param {string} input.html 已解码的页面文本
 * @param {string} input.pageUrl 实际抓到的页面地址
 * @param {string} input.finalUrl 重定向后的落地地址（无重定向时等于 pageUrl）
 * @param {string} input.claimedUrl 申请人申报的站点地址
 * @param {ReadonlySet<string>} input.acceptedHosts buildAcceptedHosts 的结果
 * @param {boolean} [input.truncated] 响应体被截断（后面的页脚根本没读到）
 * @returns {{verdict: string, message: string, anchors: Array<{url: string, text: string}>, stats: object}}
 */
export const findBacklink = ({ html, pageUrl, finalUrl, claimedUrl, acceptedHosts, truncated = false }) => {
  const hosts = acceptedHosts instanceof Set ? acceptedHosts : new Set(acceptedHosts ?? []);
  if (hosts.size === 0) throw new TypeError('acceptedHosts 不能为空');
  const claimedHost = registrableHost(new URL(String(claimedUrl)).hostname);
  const landedHost = registrableHost(new URL(String(finalUrl || pageUrl)).hostname);
  const anchors = extractAnchorUrls(html, finalUrl || pageUrl);
  const distinctHosts = [...new Set(anchors.map((anchor) => registrableHost(new URL(anchor.url).hostname)))];
  const stats = {
    anchorCount: anchors.length,
    hostCount: distinctHosts.length,
    sampleHosts: distinctHosts.slice(0, 8),
    landedHost,
    claimedHost,
    truncated: Boolean(truncated),
  };

  if (landedHost !== claimedHost) {
    return {
      verdict: BACKLINK_VERDICTS.OFFSITE,
      message: `申报地址是 ${claimedHost}，但访问后落在 ${landedHost}（发生了跳转到别的域名），需要人工确认。`,
      anchors: [],
      stats,
    };
  }

  if (anchors.length === 0) {
    return {
      verdict: BACKLINK_VERDICTS.JS_ONLY,
      message: '抓到的 HTML 里没有任何静态 <a> 链接，友链很可能是 JS 渲染的（静态抓取看不到）。',
      anchors: [],
      stats,
    };
  }

  const hits = anchors.filter((anchor) => isBacklinkHost(new URL(anchor.url).hostname, hosts));
  if (hits.length > 0) {
    return {
      verdict: BACKLINK_VERDICTS.FOUND,
      message: `检测到指向本站的反链（共 ${hits.length} 处）。`,
      anchors: hits.slice(0, 3),
      stats,
    };
  }

  const truncationNote = truncated ? '注意：响应体超过读取上限被截断，页脚部分可能没读到。' : '';
  return {
    verdict: BACKLINK_VERDICTS.NOT_FOUND,
    message: `页面有 ${anchors.length} 个静态链接，但没有指向本站域名的 <a>（检测到的是静态 HTML，JS 渲染的挂件看不到）。${truncationNote}`,
    anchors: [],
    stats,
  };
};

/**
 * 传输层结论（抓取失败 / 站点拒绝自动化）——与 findBacklink 同构，供评论与日志统一渲染。
 * @param {object} input
 * @param {number} [input.status] HTTP 状态码（网络失败时为 0）
 * @param {string} [input.error] 错误摘要（已脱敏的 URL 或原因）
 * @returns {{verdict: string, message: string, anchors: never[], stats: object}}
 */
export const buildTransportVerdict = ({ status = 0, error = '' }) => {
  if (RESTRICTED_STATUS_CODES.has(status)) {
    return {
      verdict: BACKLINK_VERDICTS.RESTRICTED,
      message: `对方服务器返回 HTTP ${status}：可达但拒绝了自动化抓取，证据不足（不等于没挂链）。`,
      anchors: [],
      stats: { status },
    };
  }
  return {
    verdict: BACKLINK_VERDICTS.FETCH_ERROR,
    message: `抓取失败：${String(error || `HTTP ${status || '未知'}`)}`,
    anchors: [],
    stats: { status },
  };
};

/**
 * 可达性判定（与反链判定是两回事）：能不能拿到一次成功响应。
 *
 * 检测跑在 GitHub Actions 的美欧出口 IP 上，所以「国内能打开」不等于「这里能打开」——
 * 开启禁海外的站点会连接超时或被 CDN 判 403，两种都算无法访问。
 * 401/403 这里也判不可达（与上面 `restricted` 的口径不冲突：那边说的是
 * 「页面可达但拒绝自动化，反链证据不足」，这里说的是「连一次正常响应都没拿到」）。
 * @param {{status?: number, error?: string}} input HTTP 状态（连接层失败时为 0）
 * @returns {{reachable: boolean, reason: string}}
 */
export const classifyReachability = ({ status = 0, error = '' }) => {
  if (status >= 200 && status < 400) {
    return { reachable: true, reason: `HTTP ${status}` };
  }
  if (status === 0) {
    return { reachable: false, reason: String(error || '无法建立连接或超时') };
  }
  if (RESTRICTED_STATUS_CODES.has(status)) {
    return { reachable: false, reason: `HTTP ${status}（服务器拒绝了这个请求：多半是禁海外 / 防火墙 / 反爬）` };
  }
  return { reachable: false, reason: `HTTP ${status}` };
};
