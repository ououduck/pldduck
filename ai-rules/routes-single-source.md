# 路由单一数据源 — AI 修改规则

## 功能概述

`config/routes.mjs` 是全站路由清单的**唯一数据源**。一个页面在该文件里登记一次，
其余所有需要"知道有哪些路由"的地方都从它派生：

| 消费方                           | 用途                         | 派生方式                                                                                  |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| `src/App.tsx`                    | react-router 路由表与懒加载  | 按 `path` 逐条声明（由测试断言与 `ROUTES` 一致）                                          |
| `src/utils/preload.ts`           | 悬停预加载的 chunk 键        | `pageLoaders` 的键集合须等于 `PRELOADABLE_PATHS`                                          |
| `src/utils/siteUrl.ts`           | 子路径部署时推断 base        | `BASE_ROUTE_MARKERS`                                                                      |
| `scripts/ssg.mjs`                | 构建期预渲染与页面级 JSON-LD | `SSG_STATIC_PAGES` / `ssg` 字段                                                           |
| `scripts/generate-site-data.mjs` | `sitemap-pages.xml` 条目     | `SITEMAP_PAGES`                                                                           |
| `public/sw.js`                   | 离线导航的 SPA 兜底模式      | 构建期由 `scripts/lib/sw-version.mjs` 覆写 `/* ROUTES:BEGIN */ … /* ROUTES:END */` 标记区 |

字段约定（详见文件头注释）：`path` react-router 路径；`segment` URL 首段（`''` 首页、
`null` 通配）；`preload` 是否悬停预加载；`sw` 是否允许应用壳兜底；`ssg` 预渲染方式
（`static` / `static-home` / `posts` / `shuoshuo` / `not-found`）；`seo` 静态页页面级
SEO（`title` 只写前缀，站点名后缀由 `ssg.mjs` 用 `siteConfig.title` 拼接）；`sitemap`
进入 `sitemap-pages.xml` 的 changefreq/priority。

## 关键文件

- `config/routes.mjs`（唯一清单）
- `scripts/routes-consistency.test.mjs`（防漂移守卫）
- `scripts/lib/sw-version.mjs`（构建期注入 sw 标记区）
- `public/sw.js`（含标记区，不要手改标记区内容）

## 修改规则（必须遵守）

1. **只改这一处**：新增/删除/改名页面一律只动 `config/routes.mjs`。禁止在任何消费方
   另立一份路径表、`switch` 白名单或正则常量。
2. **文章与说说的 URL 是对外契约**：`/post/:id`、`/shuoshuo/:id` 及其 `segment` 不得改动
   ——旧博客域名上挂着这些地址的 301，外链与搜索收录也按此格式，改一次即全部作废。
3. **`seo.title` 只写页面名前缀**（如「归档」），站点名后缀由 `ssg.mjs` 统一拼
   `siteConfig.title`；写全会导致「A - 跑路的duck - 跑路的duck」这类重复。
4. **首页是唯一例外**：`/` 的 title 由 `siteConfig.seoHomeTitle` 逐字覆盖，不走拼接规则。
5. **新增静态页必须显式选择三个开关**：`preload`（是否悬停预加载）、`sw`（是否允许应用壳
   兜底）、`ssg`（预渲染方式）。漏写 `sw: true` 会让离线访问该页落到 `offline.html`。
6. **`public/sw.js` 的 `ROUTES:BEGIN/END` 标记区是生成物**：可以改 `routes.mjs` 让构建重写，
   但不要手工编辑标记区内部内容——`routes-consistency.test.mjs` 会拿它和
   `buildServiceWorkerRoutePatternSource()` 的产物逐字比对。标记区外的缓存逻辑照常手改。
7. **改完必须跑守卫测试**：`npx vitest run scripts/routes-consistency.test.mjs`，
   再 `npm run build` 确认 `dist/` 下直出 HTML 的路径集合与预期一致。
8. **`BASE_ROUTE_MARKERS` 的裸段/尾斜杠区分有语义**：列表段用裸匹配（`/shuoshuo`），
   只有详情段带尾斜杠（`/post/`）。这条由测试锁死，不要"顺手统一"。

## 常见陷阱

- 加了页面但忘了登记 `ROUTES`：`App.tsx` 能路由但 SSG 不直出，该 URL 首屏是空壳；
- 在 `preload.ts` 里新增键却没在 `routes.mjs` 标 `preload`（或反之）：键集合不一致，测试红；
- 手改 sw 标记区：本地看起来正常，下一次构建被静默覆写；
- 把 `seo.title` 写成完整标题：SEO 审计不报错，但搜索结果里站点名出现两次。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
