// @vitest-environment node
/**
 * 路由一致性守卫：config/routes.mjs 是唯一数据源，本测试确保各消费方不漂移。
 * 覆盖 App.tsx 路由表、preload.ts 预加载键、public/sw.js 标记区与派生清单语义。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
  BASE_ROUTE_MARKERS,
  PRELOADABLE_PATHS,
  ROUTES,
  SSG_STATIC_PAGES,
  SITEMAP_PAGES,
  SPA_ROUTE_SEGMENTS,
  buildServiceWorkerRoutePatternSource,
} from '../config/routes.mjs';
import { pageLoaders } from '../src/utils/preload.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 从 App.tsx 源码里抽出 react-router 声明的 path 集合。 */
const readAppRoutePaths = () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src/App.tsx'), 'utf-8');
  return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
};

describe('routes 单一数据源', () => {
  it('App.tsx 的路由表与 ROUTES 完全一致（不多不少不重复）', () => {
    const declared = readAppRoutePaths();
    const source = ROUTES.map((item) => item.path);
    expect(declared.sort()).toEqual([...source].sort());
    expect(new Set(source).size).toBe(source.length);
  });

  it('preload.ts 的键集合与 PRELOADABLE_PATHS 一致', () => {
    expect(Object.keys(pageLoaders).sort()).toEqual([...PRELOADABLE_PATHS].sort());
  });

  it('public/sw.js 的标记区与生成结果一致（构建期会被同一函数覆写）', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'public/sw.js'), 'utf-8');
    const begin = source.indexOf('/* ROUTES:BEGIN');
    const end = source.indexOf('/* ROUTES:END */');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const body = source.slice(source.indexOf('\n', begin) + 1, end).trim();
    expect(body).toBe(buildServiceWorkerRoutePatternSource().trim());
  });

  it('每个预渲染静态页都被 SPA 兜底模式覆盖', () => {
    const pattern = new RegExp(`^\\/(?:${SPA_ROUTE_SEGMENTS.join('|')})(?:\\/|$)`);
    for (const page of SSG_STATIC_PAGES) {
      expect(pattern.test(`/${page.path}`)).toBe(true);
    }
  });

  it('base 推断标记：列表段裸匹配、仅详情段带尾斜杠', () => {
    expect(BASE_ROUTE_MARKERS).toContain('/shuoshuo');
    expect(BASE_ROUTE_MARKERS).not.toContain('/shuoshuo/');
    expect(BASE_ROUTE_MARKERS).toContain('/post/');
    expect(BASE_ROUTE_MARKERS).not.toContain('/post');
  });

  it('sitemap 清单含首页且路径无重复', () => {
    expect(SITEMAP_PAGES.map((item) => item.path)).toContain('');
    const paths = SITEMAP_PAGES.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
