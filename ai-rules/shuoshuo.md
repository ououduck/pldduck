# 说说（ShuoShuo）— AI 修改规则

## 功能概述

说说页 `/shuoshuo` 是一个「朋友圈」式短动态流，内容来自仓库内的 `shuoshuo/*.md`，由 Pages CMS 的「说说」集合维护。

- 数据源：`shuoshuo/*.md`，frontmatter 提供 `id` / `date` / `images`，正文即内容；
- 构建期：`scripts/generate-site-data.mjs` 解析为 `generated/shuoshuo.json`，前端 `src/services/shuoshuo.ts` 用 eager glob 内联，SSG 首帧直出；
- 分页：**每 10 条一个页面**，只有 `/shuoshuo`（第 1 页）与 `/shuoshuo/page/<n>` 两种路径，各自是真实存在的静态 HTML；
- 交互：正文搜索、图片查看器（正文图片与九宫格共用同一画廊）；
- **没有**逐条独立页面、**没有**逐条链接、**没有**分享按钮、**没有**评论区。

### 为什么是「每 10 条一页」而不是逐条页面（2026-11 定稿）

用户明确要求减少构建产物数量。逐条页面会让每个 HTML 都携带完整应用壳与 SEO 头，产物数量随说说条数线性增长，而逐条页面的实际流量极低。改成分页后，12 条内容只产出 2 个 HTML，SEO 由列表页（`CollectionPage` + `ItemList`）承担。**不要**把逐条页恢复回来。

## 关键文件

- 页面：`src/pages/ShuoShuo.tsx`
- 组件：`src/components/ShuoShuoItem.tsx`（条目卡 + 微信朋友圈式九宫格）
- 分页唯一口径：`config/shuoshuo.mjs`（`SHUOSHUO_PER_PAGE` / `shuoshuoPagePath` / `shuoshuoPageCount`）
- 数据：`scripts/generate-site-data.mjs`（解析 md）、`src/services/shuoshuo.ts`（内联 + 标题派生）、`src/utils/shuoshuo.ts`（前端路径与 SEO 描述）
- 配置：`.pages.yml` 的 `shuoshuo` 集合
- 路由：`config/routes.mjs` 的 `/shuoshuo`（`ssg: 'static'`）与 `/shuoshuo/page/:page`（`ssg: 'shuoshuo'`）

## 修改规则（必须遵守）

1. **内容只来自 `shuoshuo/*.md`**：不得改回从 GitHub Discussions 抓取，也不得在浏览器里发请求取内容。站点不抓取任何 Discussions 内容，构建结果必须可复现。
2. **frontmatter 契约**：`id` 必填且只允许 `[A-Za-z0-9_-]`（它同时是文件名与数据主键）、`date` 必填 `YYYY-MM-DD`、`images` 可选数组。缺失/重复/非法一律 fail-closed（构建失败），与文章同级门槛。
3. **分页口径唯一来源**：页数、每页条数、路径只能从 `config/shuoshuo.mjs` 取。`config/routes.mjs`、`scripts/ssg.mjs`、`src/pages/ShuoShuo.tsx` 三处必须由它派生 —— 任何一处私自写死 10 或 `/shuoshuo/page/` 都会让「预渲染的 HTML 数」与「前端分页」错位。
4. **不生成逐条页面**：不得恢复 `/shuoshuo/:id` 路由、`ShuoShuoDetail` 页面或 `getInitialShuoShuoItem`。旧格式深链由 `public/_redirects` 的 `/shuoshuo/:splat → /shuoshuo 301` 兜住。
5. **无评论区**：说说页与条目卡都不得挂 `GiscusComments`。站内评论只剩文章评论区。
6. **无分享与永久链接**：条目卡不提供分享按钮、不提供「永久链接」入口、不引入 `ShareModal`。说说没有可分享的单条 URL。
7. **九宫格口径**：1 张单列、2 张与 4 张两列、其余三列（微信朋友圈的实际排布）；图片正方形裁切、网格窄于内容列（`max-w-[12rem]` / `[15rem]` / `[22rem]`），不得铺满整行、不得用 `grid-cols-3` 硬塞所有数量。
8. **标题派生一致**：列表与 SEO 的标题都走 `getShuoShuoTitle`（`src/services/shuoshuo.ts`，先 `stripMarkdown` 再取首行），不要在各处自己 `slice` 正文。
9. **搜索不分页**：有搜索词时一次性展示全部命中项，分页控件隐藏；分页只在无搜索词时出现。
10. **SSG 确定性**：排序按 `date` 倒序、同日按 `id` 升序；渲染期不得依赖时钟或随机值，否则 SSG 与水合会不一致。

## 常见陷阱

- **改 `id` 等于改历史数据的键**：`generated/shuoshuo.json` 的主键、外链深链、`?id=` 定位都依赖它。
- **`generated/shuoshuo.json` 是构建产物**（`.gitignore` 已忽略），不要手工编辑，也不要提交。
- **正文单行过长**：单条正文上限 5000 字符，超限直接 fail-closed —— 那是标题/摘要派生与页面体积的成本控制，不是 bug。
- **`images` 必须是 http(s) 或站内绝对路径**：相对路径会被校验拦下（站内路径要写 `/images/...`）。
- **分页越界**：`/shuoshuo/page/999` 在前端会收敛到最后一页，但 SSG 只生成真实存在的页 —— 不要指望这种 URL 有静态 HTML。
- **`_redirects` 规则顺序**：`/shuoshuo/page/:splat` 必须写在 `/shuoshuo/:splat` 之前，否则分页会被 301 掉。
- **九宫格别加占位空格**：2 张 / 4 张是靠列数变化排布，不是靠留白格子。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
