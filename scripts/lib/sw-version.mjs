/**
 * Service Worker 缓存版本与构建产物联动（ai-rules/service-worker.md 规则 5）：
 * 以构建产物 assets 目录的文件名清单为内容源计算 hash，替换 dist/sw.js 中
 * 的 SW_VERSION 常量。产物变化（Vite 内容 hash 文件名）→ 版本变化 →
 * activate 阶段的旧缓存清理随之生效；纯内容更新（文章 Markdown）由页面
 * 缓存的 network-first 策略保证新鲜度，不依赖版本号。
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { buildServiceWorkerRoutePatternSource } from '../../config/routes.mjs';

/** 汇集 dist/assets 下全部文件名（相对 dist、POSIX 分隔、排序），计算短 hash 版本号。 */
export const computeServiceWorkerVersion = (distDir) => {
  const assetDir = path.join(distDir, 'assets');
  const names = [];
  const collect = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collect(fullPath);
      } else {
        names.push(path.relative(distDir, fullPath).split(path.sep).join('/'));
      }
    }
  };
  collect(assetDir);
  names.sort();
  const hash = crypto.createHash('sha256').update(names.join('\n')).digest('hex').slice(0, 12);
  return `dblog-${hash}`;
};

/** 用计算出的版本号替换 dist/sw.js 的 SW_VERSION 常量（幂等）；失败抛错阻断构建。 */
export const patchServiceWorkerVersion = (distDir) => {
  const swPath = path.join(distDir, 'sw.js');
  const source = fs.readFileSync(swPath, 'utf-8');
  const version = computeServiceWorkerVersion(distDir);
  const patched = source.replace(/const SW_VERSION = 'dblog-[^']*';/, `const SW_VERSION = '${version}';`);
  if (patched === source) {
    throw new Error(`SW_VERSION placeholder not found (or already patched) in ${swPath}`);
  }
  fs.writeFileSync(swPath, patched);
  return version;
};

const ROUTES_BEGIN_MARKER = '/* ROUTES:BEGIN';
const ROUTES_END_MARKER = '/* ROUTES:END */';

/**
 * 用 config/routes.mjs 生成的 SPA_ROUTE_PATTERNS 替换 dist/sw.js 的 ROUTES:BEGIN/END
 * 标记区（路由清单唯一数据源，避免 service worker 与路由表漂移）。
 * 幂等：重复执行结果一致；标记缺失或顺序错误时抛错阻断构建。
 */
export const patchServiceWorkerRoutes = (distDir) => {
  const swPath = path.join(distDir, 'sw.js');
  const source = fs.readFileSync(swPath, 'utf-8');
  const begin = source.indexOf(ROUTES_BEGIN_MARKER);
  const end = source.indexOf(ROUTES_END_MARKER);
  if (begin < 0 || end < 0 || end < begin) {
    throw new Error(`ROUTES marker block not found in ${swPath}`);
  }
  const beginLineEnd = source.indexOf('\n', begin);
  if (beginLineEnd < 0 || beginLineEnd > end) {
    throw new Error(`ROUTES:BEGIN marker must occupy its own line in ${swPath}`);
  }
  const patched = `${source.slice(0, beginLineEnd + 1)}${buildServiceWorkerRoutePatternSource()}\n${source.slice(end)}`;
  fs.writeFileSync(swPath, patched);
  return patched;
};
