// @vitest-environment node
/**
 * 渲染兜底的 SSRF 护栏：这些用例守的是「申请人的页面永远无法指挥无头浏览器
 * 访问本机/内网/元数据地址」。真实渲染需要 Chromium，这里只测同步拦截口径。
 */
import { describe, it, expect } from 'vitest';
import { isBlockedRenderTarget, renderPage } from './render-html.mjs';

describe('isBlockedRenderTarget', () => {
  it('公开 http/https 放行', () => {
    expect(isBlockedRenderTarget('https://blog.example.com/friends')).toBe(false);
    expect(isBlockedRenderTarget('http://blog.example.com')).toBe(false);
    expect(isBlockedRenderTarget('https://1.1.1.1/')).toBe(false);
  });

  it('非 http(s) 协议与非法地址一律拦截', () => {
    expect(isBlockedRenderTarget('file:///etc/passwd')).toBe(true);
    expect(isBlockedRenderTarget('javascript:alert(1)')).toBe(true);
    expect(isBlockedRenderTarget('data:text/html,<a href=https://pldduck.com>')).toBe(true);
    expect(isBlockedRenderTarget('not a url')).toBe(true);
  });

  it('localhost 与回环地址拦截', () => {
    expect(isBlockedRenderTarget('http://localhost:8080/')).toBe(true);
    expect(isBlockedRenderTarget('http://foo.localhost/')).toBe(true);
    expect(isBlockedRenderTarget('http://127.0.0.1/')).toBe(true);
    expect(isBlockedRenderTarget('http://[::1]/')).toBe(true);
    expect(isBlockedRenderTarget('http://0.0.0.0/')).toBe(true);
  });

  it('内网/链路本地/云元数据地址拦截（含十进制与 IPv4-mapped 变形）', () => {
    expect(isBlockedRenderTarget('http://10.0.0.5/')).toBe(true);
    expect(isBlockedRenderTarget('http://192.168.1.1/')).toBe(true);
    expect(isBlockedRenderTarget('http://172.16.0.1/')).toBe(true);
    expect(isBlockedRenderTarget('http://169.254.169.254/latest/meta-data/')).toBe(true);
    expect(isBlockedRenderTarget('http://2130706433/')).toBe(true);
    expect(isBlockedRenderTarget('http://[::ffff:127.0.0.1]/')).toBe(true);
  });
});

describe('renderPage 的入口护栏', () => {
  it('内网地址在启动浏览器之前就被拒绝（不需要 Chromium 参与）', async () => {
    const result = await renderPage('http://127.0.0.1:8787/');
    expect(result.error).toContain('SSRF');
  });
});
