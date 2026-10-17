// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BACKLINK_VERDICTS,
  buildAcceptedHosts,
  decodeHtmlBytes,
  extractAnchorUrls,
  findBacklink,
  buildTransportVerdict,
  classifyReachability,
  registrableHost,
} from './friend-backlink.mjs';

const SITE = 'https://www.pldduck.com';
const accepted = buildAcceptedHosts(SITE);

/** 组装一段带若干锚点的 HTML。 */
const page = (...anchors) => `<html><body><footer>${anchors.join('\n')}</footer></body></html>`;

const detect = (html, overrides = {}) =>
  findBacklink({
    html,
    pageUrl: 'https://blog.example.com/links',
    finalUrl: 'https://blog.example.com/links',
    claimedUrl: 'https://blog.example.com',
    acceptedHosts: accepted,
    ...overrides,
  });

describe('registrableHost', () => {
  it('小写、去尾点、去 www.、去 IPv6 方括号', () => {
    expect(registrableHost('WWW.PldDuck.COM.')).toBe('pldduck.com');
    expect(registrableHost('[::1]')).toBe('::1');
    expect(registrableHost('')).toBe('');
  });
});

describe('buildAcceptedHosts', () => {
  it('www 与裸域归一为同一集合', () => {
    expect([...buildAcceptedHosts('https://www.pldduck.com/')]).toEqual(['pldduck.com']);
    expect([...buildAcceptedHosts('https://pldduck.com')]).toEqual(['pldduck.com']);
  });

  it('无法解析或缺主机名时抛错（fail-closed，绝不静默放行）', () => {
    expect(() => buildAcceptedHosts('not a url')).toThrow(TypeError);
    expect(() => buildAcceptedHosts('mailto:i@pldduck.com')).toThrow(TypeError);
  });
});

describe('extractAnchorUrls', () => {
  it('识别双引号、单引号与无引号写法', () => {
    const html = page(
      '<a href="https://www.pldduck.com">a</a>',
      "<a href='https://pldduck.com'>b</a>",
      '<a href=https://www.pldduck.com/x>c</a>',
    );
    const urls = extractAnchorUrls(html, 'https://blog.example.com/').map((anchor) => anchor.url);
    expect(urls).toContain('https://www.pldduck.com/');
    expect(urls).toContain('https://pldduck.com/');
    expect(urls).toContain('https://www.pldduck.com/x');
  });

  it('跨行标签与属性顺序不影响识别', () => {
    const html = '<a\n  class="roll"\n  href="https://www.pldduck.com/"\n>跑路的duck</a>';
    expect(extractAnchorUrls(html, 'https://blog.example.com/')[0].url).toBe('https://www.pldduck.com/');
  });

  it('解析 &amp; 实体与协议相对地址', () => {
    const html = page(
      '<a href="https://www.pldduck.com/?utm=a&amp;src=friend">x</a>',
      '<a href="//www.pldduck.com">y</a>',
    );
    const urls = extractAnchorUrls(html, 'https://blog.example.com/').map((anchor) => anchor.url);
    expect(urls).toContain('https://www.pldduck.com/?utm=a&src=friend');
    expect(urls).toContain('https://www.pldduck.com/');
  });

  it('相对链接按页面地址解析（不会误判成本站）', () => {
    const urls = extractAnchorUrls(page('<a href="/pldduck">x</a>'), 'https://blog.example.com/');
    expect(urls.map((anchor) => anchor.url)).toEqual(['https://blog.example.com/pldduck']);
  });

  it('丢弃 javascript:/data:/mailto: 与无法解析的 href', () => {
    const html = page(
      '<a href="javascript:alert(1)">x</a>',
      '<a href="data:text/html,<script>alert(1)</script>">y</a>',
      '<a href="mailto:i@pldduck.com">z</a>',
      '<a name="anchor">无 href</a>',
    );
    expect(extractAnchorUrls(html, 'https://blog.example.com/')).toEqual([]);
  });

  it('同一地址只出现一次（去重）', () => {
    const html = page('<a href="https://www.pldduck.com">a</a>', '<a href="https://www.pldduck.com">b</a>');
    expect(extractAnchorUrls(html, 'https://blog.example.com/')).toHaveLength(1);
  });

  it('取到锚点文本，且不被相邻的 </article> 提前截断', () => {
    const html = '<a href="https://www.pldduck.com">跑路的duck</article></a>';
    expect(extractAnchorUrls(html, 'https://blog.example.com/')[0].text).toBe('跑路的duck');
  });

  it('页面地址非法时返回空数组而不是抛错', () => {
    expect(extractAnchorUrls(page('<a href="https://www.pldduck.com">x</a>'), 'oops')).toEqual([]);
  });
});

describe('findBacklink', () => {
  it('裸域与 www 都算命中', () => {
    expect(detect(page('<a href="https://pldduck.com">x</a>')).verdict).toBe(BACKLINK_VERDICTS.FOUND);
    expect(detect(page('<a href="https://www.pldduck.com/">x</a>')).verdict).toBe(BACKLINK_VERDICTS.FOUND);
  });

  it('大写主机与子域算命中', () => {
    expect(detect(page('<a href="https://WWW.PLDDUCK.COM">x</a>')).verdict).toBe(BACKLINK_VERDICTS.FOUND);
    expect(detect(page('<a href="https://link.pldduck.com/friends">x</a>')).verdict).toBe(BACKLINK_VERDICTS.FOUND);
  });

  it('后缀伪装（pldduck.com.evil.net / evil-pldduck.com）不命中', () => {
    for (const url of ['https://pldduck.com.evil.net', 'https://evil-pldduck.com', 'https://notpldduck.com/x']) {
      expect(detect(page(`<a href="${url}">x</a>`)).verdict).toBe(BACKLINK_VERDICTS.NOT_FOUND);
    }
  });

  it('HTML 注释里残留的链接不算命中（主题模板常见的假阳性）', () => {
    const html = page(
      '<!-- <a href="https://www.pldduck.com">旧模板残留</a> -->',
      '<a href="https://example.com">x</a>',
    );
    const result = detect(html);
    expect(result.verdict).toBe(BACKLINK_VERDICTS.NOT_FOUND);
    expect(result.stats.anchorCount).toBe(1);
  });

  it('未闭合的注释也被剥离（不吞掉后面的正常链接判定）', () => {
    const result = detect('<a href="<!-- broken https://www.pldduck.com">x</a>');
    expect(result.verdict).not.toBe(BACKLINK_VERDICTS.FOUND);
  });

  it('非 <a> 元素（图片 / canonical / meta refresh）不算反链', () => {
    const html =
      '<img src="https://www.pldduck.com/logo.png"><link rel="canonical" href="https://www.pldduck.com">' +
      '<meta http-equiv="refresh" content="0; url=https://www.pldduck.com"><a href="https://example.com">x</a>';
    expect(detect(html).verdict).toBe(BACKLINK_VERDICTS.NOT_FOUND);
  });

  it('完全没有静态 <a> 判为 js-only', () => {
    const result = detect('<html><body><div id="app"></div><script>render()</script></body></html>');
    expect(result.verdict).toBe(BACKLINK_VERDICTS.JS_ONLY);
    expect(result.message).toContain('JS 渲染');
  });

  it('落地域名与申报域名不一致判 offsite（防 301 到本站骗过检测）', () => {
    const result = detect(page('<a href="https://www.pldduck.com">x</a>'), {
      finalUrl: 'https://www.pldduck.com/from-redirect',
    });
    expect(result.verdict).toBe(BACKLINK_VERDICTS.OFFSITE);
    expect(result.stats.claimedHost).toBe('blog.example.com');
  });

  it('命中时给出锚点证据（最多 3 条）', () => {
    const html = page(
      '<a href="https://www.pldduck.com">1</a>',
      '<a href="https://www.pldduck.com/about">2</a>',
      '<a href="https://pldduck.com">3</a>',
      '<a href="https://www.pldduck.com/4">4</a>',
    );
    const result = detect(html);
    expect(result.verdict).toBe(BACKLINK_VERDICTS.FOUND);
    expect(result.anchors).toHaveLength(3);
    expect(result.anchors[0].text).toBe('1');
  });

  it('截断时在说明里如实写出来', () => {
    const result = detect(page('<a href="https://example.com">x</a>'), { truncated: true });
    expect(result.verdict).toBe(BACKLINK_VERDICTS.NOT_FOUND);
    expect(result.stats.truncated).toBe(true);
    expect(result.message).toContain('截断');
  });

  it('未命中时给出页面域名样本，便于站长判断', () => {
    const result = detect(page('<a href="https://a.example">x</a>', '<a href="https://b.example">y</a>'));
    expect(result.stats.sampleHosts).toEqual(['a.example', 'b.example']);
    expect(result.stats.anchorCount).toBe(2);
  });

  it('acceptedHosts 为空或地址非法时抛错，不返回可用结论', () => {
    expect(() =>
      findBacklink({ html: '', pageUrl: 'https://x.com', claimedUrl: 'https://x.com', acceptedHosts: new Set() }),
    ).toThrow(TypeError);
    expect(() => detect(page('<a href="https://www.pldduck.com">x</a>'), { claimedUrl: 'nope' })).toThrow();
  });
});

describe('decodeHtmlBytes', () => {
  const utf8 = (text) => Buffer.from(text, 'utf8');

  it('GBK 页面按 <meta charset> 解码（硬按 utf-8 会得到乱码）', () => {
    // 「博客」的 GB2312 字节：博 = B2 A9，客 = BF CD。
    const bytes = Buffer.concat([
      utf8('<meta http-equiv="Content-Type" content="text/html; charset=gbk"><a href="https://www.pldduck.com">'),
      Buffer.from([0xb2, 0xa9, 0xbf, 0xcd]),
      utf8('</a>'),
    ]);
    const { text, charset } = decodeHtmlBytes(bytes);
    expect(charset).toBe('gbk');
    expect(text).toContain('博客');
    expect(detect(text).verdict).toBe(BACKLINK_VERDICTS.FOUND);
  });

  it('Content-Type 头的 charset 优先于 <meta>', () => {
    const { charset } = decodeHtmlBytes(utf8('<meta charset="utf-8">ok'), 'text/html; charset=GB18030');
    expect(charset).toBe('GB18030');
  });

  it('UTF-8 / UTF-16 BOM 优先识别并跳过 BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    expect(decodeHtmlBytes(Buffer.concat([bom, utf8('hi')])).charset).toBe('utf-8 (BOM)');
    expect(decodeHtmlBytes(Buffer.concat([bom, utf8('hi')])).text).toBe('hi');
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]);
    expect(decodeHtmlBytes(le)).toMatchObject({ charset: 'utf-16 (BOM)', text: 'hi' });
    const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from([0x00, 0x68, 0x00, 0x69])]);
    expect(decodeHtmlBytes(be).text).toBe('hi');
  });

  it('未知字符集标签回退 utf-8 且不抛（TextDecoder 构造会抛 RangeError）', () => {
    const { text, charset } = decodeHtmlBytes(utf8('hello'), 'text/html; charset=not-a-real-charset');
    expect(charset).toBe('not-a-real-charset');
    expect(text).toBe('hello');
  });

  it('非法字节不抛错（fatal:false，替换字符可接受）', () => {
    const bytes = Buffer.concat([
      utf8('<meta charset="utf-8"><a href="https://www.pldduck.com">'),
      Buffer.from([0xc3, 0x28]),
    ]);
    expect(() => decodeHtmlBytes(bytes)).not.toThrow();
    expect(detect(decodeHtmlBytes(bytes).text).verdict).toBe(BACKLINK_VERDICTS.FOUND);
  });

  it('<meta charset> 只在头 2048 字节里嗅探', () => {
    const padded = Buffer.concat([
      utf8('<html><head>'),
      Buffer.alloc(3000, 0x20),
      utf8('<meta charset="gbk">'),
      utf8('<a href="https://example.com">x</a>'),
    ]);
    expect(decodeHtmlBytes(padded).charset).toBe('utf-8');
  });

  it('空响应返回空串', () => {
    expect(decodeHtmlBytes(Buffer.alloc(0))).toEqual({ text: '', charset: 'utf-8' });
  });
});

describe('buildTransportVerdict', () => {
  it('401/403/429 归为 restricted：可达但拒绝自动化，不等于没挂链', () => {
    for (const status of [401, 403, 405, 406, 407, 429]) {
      const verdict = buildTransportVerdict({ status });
      expect(verdict.verdict).toBe(BACKLINK_VERDICTS.RESTRICTED);
      expect(verdict.message).toContain('证据不足');
    }
  });

  it('网络失败与 4xx/5xx 归为 fetch-error', () => {
    expect(buildTransportVerdict({ status: 0, error: 'getaddrinfo ENOTFOUND' }).verdict).toBe(
      BACKLINK_VERDICTS.FETCH_ERROR,
    );
    expect(buildTransportVerdict({ status: 404 }).message).toContain('HTTP 404');
  });
});

describe('classifyReachability', () => {
  it('2xx 与 3xx（重定向已被逐跳跟完）算能访问', () => {
    expect(classifyReachability({ status: 200 })).toEqual({ reachable: true, reason: 'HTTP 200' });
    expect(classifyReachability({ status: 304 }).reachable).toBe(true);
  });

  it('连接层失败（status 0）算打不开，并带上错误摘要', () => {
    const result = classifyReachability({ status: 0, error: 'getaddrinfo ENOTFOUND blog.test' });
    expect(result.reachable).toBe(false);
    expect(result.reason).toContain('ENOTFOUND');
  });

  it('403/429 这类「服务器拒绝」在可达性口径里就是打不开（与反链口径的 restricted 故意不同）', () => {
    const result = classifyReachability({ status: 403 });
    expect(result.reachable).toBe(false);
    expect(result.reason).toContain('403');
    expect(result.reason).toContain('禁海外');
  });

  it('404/500 等其余状态码算打不开并原样给出状态', () => {
    expect(classifyReachability({ status: 404 })).toEqual({ reachable: false, reason: 'HTTP 404' });
    expect(classifyReachability({ status: 503 })).toEqual({ reachable: false, reason: 'HTTP 503' });
  });

  it('缺参数时按最保守的「打不开」处理', () => {
    expect(classifyReachability({}).reachable).toBe(false);
  });
});
