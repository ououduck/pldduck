/**
 * friend-page-fetch.mjs — 友链相关脚本共用的 HTML 抓取（逐跳 SSRF 校验 + 受限状态码分类）。
 *
 * 从 friend-link-check.mjs 抽出，供「申请检测」与「反链巡检」共用同一套抓取口径：
 *   - 每一跳重定向都重新做 isSafePublicHttpUrl 校验（初始地址安全不代表跳转目标安全）；
 *   - 401/403/405/406/407/429 归 restricted（可达但拒绝自动化，≠ 没挂链）；
 *   - 响应体限量读取 + 按 BOM/Content-Type/<meta charset> 解码。
 */

import {
  fetchWithRetry,
  getSafeFetchAgent,
  isSafePublicHttpUrl,
  readResponseBytesLimited,
  RetryableHttpError,
} from './http.mjs';
import { RESTRICTED_STATUS_CODES, buildTransportVerdict, decodeHtmlBytes } from './friend-backlink.mjs';
import { formatError } from './gh-actions-logger.mjs';

/** 与浏览器一致的请求头：不少站点对 Actions 默认 UA 直接 403。 */
export const DEFAULT_PAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/**
 * 创建一个 HTML 抓取器。
 * @param {object} [config]
 * @param {number} [config.timeoutMs=20000] 单次请求超时
 * @param {number} [config.maxBytes=1048576] 响应体读取上限（截断会在结果里标记）
 * @param {number} [config.maxRedirects=5] 最大重定向跳数
 * @param {number} [config.retries=1] 网络/5xx 重试次数
 * @param {Record<string,string>} [config.headers] 请求头
 * @returns {(url: string, options?: { limitBytes?: number }) =>
 *   Promise<{ html: string, finalUrl: string, status: number, truncated: boolean } | { transport: object }>}
 */
export const createPageFetcher =
  ({ timeoutMs = 20000, maxBytes = 1024 * 1024, maxRedirects = 5, retries = 1, headers = DEFAULT_PAGE_HEADERS } = {}) =>
  async (url, { limitBytes = maxBytes } = {}) => {
    let current = url;
    const dispatcher = await getSafeFetchAgent();
    for (let hops = 0; hops <= maxRedirects; hops += 1) {
      if (!(await isSafePublicHttpUrl(current))) {
        return { transport: buildTransportVerdict({ error: '非公开 HTTP(S) 地址（SSRF 防护拦截）' }) };
      }

      let response;
      try {
        response = await fetchWithRetry(
          current,
          { method: 'GET', redirect: 'manual', headers },
          { timeoutMs, retries, dispatcher },
        );
      } catch (error) {
        const status = error instanceof RetryableHttpError ? error.status : 0;
        if (RESTRICTED_STATUS_CODES.has(status)) return { transport: buildTransportVerdict({ status }) };
        return { transport: buildTransportVerdict({ error: formatError(error) }) };
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location) return { transport: buildTransportVerdict({ error: '重定向缺少 Location' }) };
        try {
          current = new URL(location, current).toString();
        } catch {
          return { transport: buildTransportVerdict({ error: '重定向 Location 非法' }) };
        }
        continue;
      }

      if (RESTRICTED_STATUS_CODES.has(response.status)) {
        await response.body?.cancel().catch(() => {});
        return { transport: buildTransportVerdict({ status: response.status }) };
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        return { transport: buildTransportVerdict({ status: response.status }) };
      }

      const { bytes, truncated } = await readResponseBytesLimited(response, { maxBytes: limitBytes });
      const { text } = decodeHtmlBytes(bytes, response.headers.get('content-type') || '');
      return { html: text, finalUrl: current, status: response.status, truncated };
    }
    return { transport: buildTransportVerdict({ error: `重定向超过 ${maxRedirects} 跳` }) };
  };
