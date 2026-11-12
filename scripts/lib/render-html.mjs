/**
 * render-html.mjs — 无头浏览器渲染兜底（只给友链反链检测「静态没命中」的分支用）。
 *
 * 为什么需要：不少主题把友链挂件交给 Vue/React 在浏览器里渲染，静态 HTML 里一个 <a>
 * 都没有，旧口径只能写「暂未见链接」。这里用 Playwright 的 Chromium 真正执行页面脚本，
 * 把渲染后的 DOM（含所有 iframe）里的绝对锚点交给 findBacklinkInAnchors ——
 * **判定口径不变**，变的只是「证据从哪里来」。
 *
 * 安全边界（与 lib/http.mjs 的三层 SSRF 防御配合）：
 *   1. 渲染前先过 isSafePublicHttpUrl（域名 DNS 逐 IP 私网校验）；
 *   2. 页面里的**每个**子请求都要过 context.route：协议白名单 + localhost/私网 IP
 *      字面量直接 abort，域名再走一次 DNS 私网校验（按 host 缓存，避免重复解析）——
 *      否则申请人页面里塞一个 <img src="http://169.254.169.254/…"> 就能把 runner 当跳板；
 *   3. 图片/媒体/字体一律不加载（挂件里的 <a> 不依赖它们），关闭下载与 Service Worker，
 *      并给子请求总数设上限，防止恶意页面拖垮 job。
 *
 * 失败一律返回 { error }，由调用方退回静态结论 —— 渲染失败永不被读成「没挂链」。
 */

/* global document, window -- page.evaluate 的回调在浏览器上下文里执行，Node 侧没有这些全局 */
import net from 'node:net';
import { isPrivateAddress, isProxyArtifactAddress, isSafePublicHttpUrl } from './http.mjs';

/** 渲染默认参数（可被调用方覆盖；环境变量在 friend-link-check.mjs 里读）。 */
export const RENDER_DEFAULTS = Object.freeze({
  timeoutMs: 25000,
  maxAnchors: 4000,
  maxFrames: 20,
  maxHtmlBytes: 2 * 1024 * 1024,
  maxRequests: 300,
});

/** 不需要加载的资源类型：挂件的锚点不依赖它们，跳过能显著缩短渲染时间。 */
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

/** 用普通 Chrome 的 UA：部分站点对 HeadlessChrome 直接 403。 */
const RENDER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 同步拦截判定（不做 DNS）：协议白名单 + localhost + 私网/代理伪 DNS 的 IP 字面量。
 * 可被单测直接覆盖；域名目标还要再过一次 isSafePublicHttpUrl（异步）。
 * @param {string} value
 * @returns {boolean} true 表示必须 abort
 */
export const isBlockedRenderTarget = (value) => {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return true;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return true;
  // URL.hostname 对 IPv6 字面量返回带方括号的形式（[::1]），先剥掉再交给 net.isIP。
  const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIP(host) !== 0 && (isPrivateAddress(host) || isProxyArtifactAddress(host))) return true;
  return false;
};

/** 把页面从顶部滚到底部：IntersectionObserver 懒渲染的挂件要滚动才会出现。 */
const scrollThroughPage = async (page, steps = 8) => {
  for (let step = 1; step <= steps; step += 1) {
    await page
      .evaluate((ratio) => {
        const height = document.body ? document.body.scrollHeight : 0;
        window.scrollTo(0, height * ratio);
      }, step / steps)
      .catch(() => {});
    await page.waitForTimeout(200).catch(() => {});
  }
};

/**
 * 收集所有 frame（含跨域 iframe —— CDP 不看同源策略）里渲染后的绝对锚点。
 * @param {import('playwright').Page} page
 * @param {{maxAnchors: number, maxFrames: number}} config
 * @returns {Promise<Array<{url: string, text: string}>>}
 */
const collectFrameAnchors = async (page, { maxAnchors, maxFrames }) => {
  const anchors = [];
  const seen = new Set();
  for (const frame of page.frames().slice(0, maxFrames)) {
    if (anchors.length >= maxAnchors) break;
    let list;
    try {
      list = await frame.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
          url: anchor.href,
          text: (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        })),
      );
    } catch {
      continue;
    }
    for (const item of Array.isArray(list) ? list : []) {
      if (anchors.length >= maxAnchors) break;
      const anchorUrl = String(item?.url || '');
      try {
        if (!['http:', 'https:'].includes(new URL(anchorUrl).protocol)) continue;
      } catch {
        continue;
      }
      if (seen.has(anchorUrl)) continue;
      seen.add(anchorUrl);
      anchors.push({ url: anchorUrl, text: String(item?.text || '').slice(0, 80) });
    }
  }
  return anchors;
};

/**
 * 渲染一个页面并收集渲染后的锚点。
 *
 * @param {string} url 页面地址
 * @param {object} [options] 覆盖 RENDER_DEFAULTS
 * @returns {Promise<
 *   | { error: string }
 *   | { html: string, finalUrl: string, status: number, anchors: Array<{url: string, text: string}>, frames: number, rendered: true }
 * >}
 */
export const renderPage = async (url, options = {}) => {
  const config = { ...RENDER_DEFAULTS, ...options };
  if (isBlockedRenderTarget(url)) return { error: 'SSRF 防护拦截（非公开 HTTP(S) 地址）' };
  if (!(await isSafePublicHttpUrl(url))) return { error: 'SSRF 防护拦截（域名解析到私网/保留地址）' };

  let chromium;
  try {
    // 懒加载：没装 playwright 时（例如只跑单测的 CI）优雅退化为「不做渲染兜底」。
    ({ chromium } = await import('playwright'));
  } catch {
    return { error: '未安装 playwright，跳过渲染兜底' };
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: config.timeoutMs,
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    });
    const context = await browser.newContext({
      userAgent: RENDER_USER_AGENT,
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      serviceWorkers: 'block',
      // 页面里的 <a target="_blank"> 不弹新窗口；渲染只读，不需要任何交互。
      javaScriptEnabled: true,
    });

    // 逐请求 SSRF 护栏：域名解析结果按 host 缓存，子请求总数设上限。
    const hostDecisions = new Map();
    let requestCount = 0;
    await context.route('**/*', async (route) => {
      requestCount += 1;
      if (requestCount > config.maxRequests) {
        await route.abort().catch(() => {});
        return;
      }
      const request = route.request();
      if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
        await route.abort().catch(() => {});
        return;
      }
      const requestUrl = request.url();
      if (isBlockedRenderTarget(requestUrl)) {
        await route.abort().catch(() => {});
        return;
      }
      let host;
      try {
        host = new URL(requestUrl).host;
      } catch {
        await route.abort().catch(() => {});
        return;
      }
      const cached = hostDecisions.get(host);
      if (cached !== undefined) {
        await (cached ? route.continue() : route.abort()).catch(() => {});
        return;
      }
      const safe = await isSafePublicHttpUrl(requestUrl).catch(() => false);
      hostDecisions.set(host, safe);
      await (safe ? route.continue() : route.abort()).catch(() => {});
    });

    const page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
    await scrollThroughPage(page);
    // networkidle 只作为「尽量等一等」：慢请求不该把整个兜底拖到超时。
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

    const anchors = await collectFrameAnchors(page, config);
    const html = (await page.content()).slice(0, config.maxHtmlBytes);
    return {
      html,
      finalUrl: page.url(),
      status: response?.status() ?? 0,
      anchors,
      frames: page.frames().length,
      rendered: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message.slice(0, 300) || '渲染失败' };
  } finally {
    await browser?.close().catch(() => {});
  }
};
