import { describe, it, expect } from 'vitest';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl, assetUrl, getRouterBasename, getSiteBasePath, routeUrl } from './siteUrl';

// 站点地址取自配置而非写死字面量：换域名后这些用例不该集体变红，
// 而 absoluteSiteUrl 的"同源重写"分支恰恰依赖 fixture 与站点同源。
const SITE_URL = siteConfig.url;

describe('getSiteBasePath / getRouterBasename', () => {
  it('默认 base path 为根路径', () => {
    expect(getSiteBasePath()).toBe('/');
  });

  it('根路径下 router basename 为 /', () => {
    expect(getRouterBasename()).toBe('/');
  });
});

describe('routeUrl', () => {
  it('根路径下原样返回绝对路径', () => {
    expect(routeUrl('/about', '/')).toBe('/about');
    expect(routeUrl('/post/hello', '/')).toBe('/post/hello');
  });

  it('子路径 base 下拼接前缀', () => {
    expect(routeUrl('/about', '/blog/')).toBe('/blog/about');
  });

  it('相对路径补全为绝对路径', () => {
    expect(routeUrl('about', '/blog/')).toBe('/blog/about');
  });

  it('已带 base 前缀的路径不重复拼接', () => {
    expect(routeUrl('/blog/about', '/blog/')).toBe('/blog/about');
    expect(routeUrl('/blog', '/blog/')).toBe('/blog');
  });

  it('保留查询参数与 hash', () => {
    expect(routeUrl('/post/a?x=1#section', '/blog/')).toBe('/blog/post/a?x=1#section');
  });

  it('外部 URL 与锚点原样返回', () => {
    expect(routeUrl('https://example.com/x', '/blog/')).toBe('https://example.com/x');
    expect(routeUrl('//cdn.example.com/x', '/blog/')).toBe('//cdn.example.com/x');
    expect(routeUrl('#anchor', '/blog/')).toBe('#anchor');
  });
});

describe('assetUrl', () => {
  it('根路径下返回站内绝对路径', () => {
    expect(assetUrl('logo.png', '/')).toBe('/logo.png');
  });

  it('子路径 base 下拼接前缀', () => {
    expect(assetUrl('/logo.png', '/blog/')).toBe('/blog/logo.png');
  });

  it('外部资源与 data URI 原样返回', () => {
    expect(assetUrl('https://img.pldduck.com/x.png', '/blog/')).toBe('https://img.pldduck.com/x.png');
    expect(assetUrl('data:image/png;base64,AAAA', '/blog/')).toBe('data:image/png;base64,AAAA');
    expect(assetUrl('//cdn.example.com/x.png', '/blog/')).toBe('//cdn.example.com/x.png');
  });
});

describe('absoluteSiteUrl', () => {
  it('空值返回站点根地址', () => {
    expect(absoluteSiteUrl(undefined, SITE_URL, '/')).toBe(`${SITE_URL}/`);
  });

  it('子路径 base 下根地址带前缀', () => {
    expect(absoluteSiteUrl(undefined, SITE_URL, '/blog/')).toBe(`${SITE_URL}/blog/`);
  });

  it('站内路径拼成完整 URL', () => {
    expect(absoluteSiteUrl('/about', SITE_URL, '/')).toBe(`${SITE_URL}/about`);
    expect(absoluteSiteUrl('/about', SITE_URL, '/blog/')).toBe(`${SITE_URL}/blog/about`);
  });

  it('相对路径补全为绝对路径', () => {
    expect(absoluteSiteUrl('about', SITE_URL, '/')).toBe(`${SITE_URL}/about`);
  });

  it('同源外部 URL 被重新挂到 base path 下', () => {
    expect(absoluteSiteUrl(`${SITE_URL}/post/x`, SITE_URL, '/blog/')).toBe(`${SITE_URL}/blog/post/x`);
  });

  it('异源 URL 原样返回', () => {
    expect(absoluteSiteUrl('https://other.example.com/x', SITE_URL, '/blog/')).toBe('https://other.example.com/x');
  });

  it('保留查询参数与 hash', () => {
    expect(absoluteSiteUrl('/post/x?page=2#top', SITE_URL, '/')).toBe(`${SITE_URL}/post/x?page=2#top`);
  });
});
