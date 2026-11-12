// @vitest-environment node
/**
 * 安全响应头（CSP）与文字对比度契约回归测试。
 *
 * 背景（2026-11 线上控制台报错 / Lighthouse Issues 面板）：
 *
 * 1. `https://scripts.clarity.ms/0.8.77/clarity.js` 被 script-src 拦截。Clarity 在
 *    `index.html` 里只有 `https://www.clarity.ms/tag/<id>` 这一支引导脚本，它会把真正的
 *    追踪脚本从 `scripts.clarity.ms` 子域下发；CSP 只放行了 `www.clarity.ms`，于是
 *    Clarity 整站完全没跑起来，控制台每次加载都报一条。
 * 2. `https://static.cloudflareinsights.com/beacon.min.js` 同样被拦截。这个脚本由
 *    Cloudflare 边缘在 HTML 末尾自动注入，仓库里任何地方都搜不到它的 URL，因此「改代码
 *    时想不起来要放行」是必然的——只能靠这层静态契约把两个源钉住。
 * 3. 侧栏分组标题用 `zinc-500`(#71717a) 叠在 surface(#141414) 上只有 3.81:1，10/11px
 *    的小字低于 WCAG AA 的 4.5:1，Lighthouse「背景色和前景色没有足够高的对比度」逐项报。
 *    修复走新增 `--color-text-tertiary` Token，本测试同时锁住 Token 的对比度下限。
 *
 * 这些断言只读源码文本（`public/_headers`、`src/index.css`、`config/tailwind.config.js`），
 * 不依赖构建产物，pnpm/npm test 即生效。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');

const HEADERS_FILE = 'public/_headers';
const CSS_FILE = 'src/index.css';
const TAILWIND_CONFIG_FILE = 'config/tailwind.config.js';

/* ============================ CSP 解析 ============================ */

const headersText = readSource(HEADERS_FILE);

/** 取出所有 `Content-Security-Policy:` 行（必须恰好一条：多行会被浏览器当成多个头）。 */
const cspLines = headersText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('Content-Security-Policy:'));

/**
 * 把 CSP 解析成 `指令名 → 源列表`。
 * 指令之间用 `;` 分隔，第一个 token 是指令名（`script-src-elem` 未显式声明时由浏览器回退到
 * `script-src`，因此这里只断声明过的指令）。
 */
const parseCsp = (value) => {
  const directives = new Map();
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    directives.set(name, sources);
  }
  return directives;
};

const csp = parseCsp(cspLines[0]?.slice('Content-Security-Policy:'.length) ?? '');
const directive = (name) => csp.get(name) ?? [];

/* ======================= 对比度（WCAG 2.x）计算 ======================= */

const parseHexColor = (value) => {
  const hex = value.replace('#', '');
  const expanded =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) throw new Error(`无法解析颜色：${value}`);
  return [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
};

const srgbToLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ([r, g, b]) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

/** WCAG 对比度：(较亮 + 0.05) / (较暗 + 0.05)。 */
const contrastRatio = (foreground, background) => {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a >= b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
};

/** 从 `:root { ... }` 里抽取所有 `--token: #rrggbb;` 颜色值（值必须是字面量，`var()` 跳过）。 */
const readRootColorTokens = () => {
  const css = readSource(CSS_FILE);
  const start = css.indexOf(':root {');
  const end = css.indexOf('\n}', start);
  if (start === -1 || end === -1) throw new Error(`${CSS_FILE} 里找不到 :root 颜色 Token 区块`);
  const tokens = {};
  for (const match of css.slice(start, end).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = parseHexColor(match[2]);
  }
  return tokens;
};

const tokens = readRootColorTokens();
const token = (name) => {
  const value = tokens[name];
  if (!value) throw new Error(`缺少设计 Token --${name}（${CSS_FILE}）`);
  return value;
};

/* ================================ 测试 ================================ */

describe('CSP：声明完整性', () => {
  it('恰好一条 Content-Security-Policy 响应头', () => {
    expect(cspLines).toHaveLength(1);
  });

  it('解析出了核心指令（防止解析器失效退化成空断言）', () => {
    expect([...csp.keys()]).toEqual(
      expect.arrayContaining(['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'frame-src']),
    );
  });

  it('兜底与防注入指令保持收紧', () => {
    expect(directive('default-src')).toEqual(["'self'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
    expect(directive('frame-ancestors')).toEqual(["'self'"]);
  });

  it('不允许 unsafe-eval / script-src 通配', () => {
    expect(cspLines[0]).not.toContain("'unsafe-eval'");
    expect(directive('script-src')).not.toContain('*');
    expect(directive('script-src')).not.toContain('https:');
  });
});

describe('CSP：Clarity（回归：scripts.clarity.ms 被拦截）', () => {
  it('script-src 同时放行 www.clarity.ms 与 scripts.clarity.ms', () => {
    // index.html 只引用 www.clarity.ms/tag/<id>，真正的追踪脚本由 scripts 子域下发。
    expect(directive('script-src')).toEqual(
      expect.arrayContaining(['https://www.clarity.ms', 'https://scripts.clarity.ms']),
    );
  });

  it('connect-src 放行 Clarity 上报域名', () => {
    expect(directive('connect-src')).toEqual(
      expect.arrayContaining(['https://www.clarity.ms', 'https://*.clarity.ms']),
    );
  });

  it('index.html 仍然只有一支 Clarity 引导脚本（与 CSP 的 www 源对应）', () => {
    const indexHtml = readSource('index.html');
    expect(indexHtml).toContain("https://www.clarity.ms/tag/' + i");
    expect(indexHtml).toContain("'yk9n836sio'");
  });
});

describe('CSP：Cloudflare Web Analytics（边缘自动注入的 beacon）', () => {
  it('script-src 放行 static.cloudflareinsights.com', () => {
    expect(directive('script-src')).toContain('https://static.cloudflareinsights.com');
  });

  it('connect-src 放行 cloudflareinsights.com（RUM 上报）', () => {
    expect(directive('connect-src')).toContain('https://cloudflareinsights.com');
  });
});

describe('CSP：其余第三方源与资源类型', () => {
  it('giscus：script-src 与 frame-src 都放行', () => {
    expect(directive('script-src')).toContain('https://giscus.app');
    expect(directive('frame-src')).toEqual(expect.arrayContaining(["'self'", 'https://giscus.app']));
  });

  it('Vercount 计数接口在 connect-src 内', () => {
    expect(directive('connect-src')).toContain('https://events.vercount.one');
  });

  it('外部图床/头像走 img-src 的 https: 通配', () => {
    expect(directive('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'https:']));
  });

  it('样式与内联脚本的既有放行不被收紧（构建产物依赖它们）', () => {
    expect(directive('style-src')).toEqual(expect.arrayContaining(["'self'", "'unsafe-inline'"]));
    expect(directive('script-src')).toContain("'unsafe-inline'");
  });
});

describe('安全头：传输与内容类型', () => {
  it('HSTS / nosniff / Referrer-Policy / X-Frame-Options / Permissions-Policy 齐备', () => {
    for (const expected of [
      'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'X-Frame-Options: SAMEORIGIN',
      'Permissions-Policy: geolocation=(), microphone=(), camera=()',
    ]) {
      expect(headersText, `缺少安全头：${expected}`).toContain(expected);
    }
  });
});

describe('文字对比度 Token（回归：分组标题 3.81:1）', () => {
  it('三级文字 Token 在 surface / surface-muted 上都达到 WCAG AA（≥ 4.5:1）', () => {
    // 侧栏分组标题（11px）与移动抽屉共用同一个 Token；11px 属小字，阈值是 4.5:1。
    expect(contrastRatio(token('color-text-tertiary'), token('color-surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-text-tertiary'), token('color-surface-muted'))).toBeGreaterThanOrEqual(4.5);
  });

  it('三级文字明显弱于二级文字（保留层级，不靠「看不见」来弱化）', () => {
    const tertiary = relativeLuminance(token('color-text-tertiary'));
    const secondary = relativeLuminance(token('color-text-secondary'));
    expect(tertiary).toBeLessThan(secondary);
    // 二级文字基线：导航标签 7.3:1。
    expect(contrastRatio(token('color-text-secondary'), token('color-surface'))).toBeGreaterThanOrEqual(7);
  });

  it('曾经的 zinc-500(#71717a) 确实不达标（本用例锁住「为什么不能改回去」）', () => {
    const zinc500 = parseHexColor('#71717a');
    expect(contrastRatio(zinc500, token('color-surface'))).toBeLessThan(4.5);
  });

  it('Tailwind 把 Token 映射成语义类 text-content-tertiary', () => {
    expect(readSource(TAILWIND_CONFIG_FILE)).toContain("'content-tertiary': 'var(--color-text-tertiary)'");
  });

  it('侧栏分组标题使用三级文字 Token（不再用 zinc-500）', () => {
    const sidebar = readSource('src/components/SiteSidebar.tsx');
    expect(sidebar).toContain('sidebar-nav-group-title');
    expect(sidebar).toContain('text-content-tertiary');
    expect(sidebar).not.toContain('dark:text-zinc-500');
  });

  it('侧栏角标透明度不低于 80%（70% 时只有 4.17:1）', () => {
    const sidebar = readSource('src/components/SiteSidebar.tsx');
    const hintLine = sidebar.split(/\r?\n/).find((line) => line.includes('nav-item-hint'));
    expect(hintLine, 'SiteSidebar 里找不到 nav-item-hint').toBeTruthy();
    const opacity = Number(hintLine.match(/opacity-(\d+)/)?.[1]);
    expect(Number.isFinite(opacity)).toBe(true);
    expect(opacity).toBeGreaterThanOrEqual(80);
  });
});
