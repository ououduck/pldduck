/**
 * patch-sw-version.mjs — 将 dist/sw.js 与本次构建联动：
 * 1) SW_VERSION 与产物文件名清单 hash 联动；
 * 2) SPA_ROUTE_PATTERNS 由 config/routes.mjs 注入（路由唯一数据源）。
 * 详见 scripts/lib/sw-version.mjs。在客户端构建之后、SSG 之前执行。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { patchServiceWorkerRoutes, patchServiceWorkerVersion } from './lib/sw-version.mjs';

const main = () => {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const distDir = path.join(rootDir, 'dist');
  const version = patchServiceWorkerVersion(distDir);
  patchServiceWorkerRoutes(distDir);
  console.log(`[build] service worker version patched: ${version}`);
};

// 入口守卫（AGENT.md 规则 11）：仅直接运行时执行，被 import 不产生副作用。
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
