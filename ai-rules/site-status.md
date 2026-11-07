# 服务状态（Better Stack Status Page）— AI 修改规则

## 功能概述

侧栏底部的「服务状态」外链入口 + 同源 `GET /api/status` Worker 代理：

- **展示链路**：`SiteStatusBadge`（桌面侧栏与移动抽屉底部共用）→ `src/services/siteStatus.ts`（同源请求）→ `worker/index.mjs`（入口）→ `worker/status.mjs`（逻辑）→ Better Stack Status Page API。
- **展示五态**：四种上游真实状态（`operational` / `degraded` / `downtime` / `maintenance`）+ 前后端共同的兜底值 `unavailable`（文案固定「服务状态」）。五种状态各有一套文案与图标颜色，只有 `operational` 是绿色。
- **状态页地址**：`siteConfig.statusPageUrl`（`config/site.config.json`，公开配置），构建期可用 `VITE_BETTERSTACK_STATUS_PAGE_URL` 覆盖；只接受 https 绝对地址。当前配置为站长提供的实际自定义域 `https://status.pldduck.com`；网络可达性未在仓库内做自动化验证。

> 本功能没有独立页面路由，也不进 `config/routes.mjs`：状态入口是侧栏上的常驻外链，跳转到 Better Stack 托管的状态页。

## 关键文件

- `src/services/siteStatus.ts`（状态值/文案映射、URL 解析、请求超时、并发去重）
- `src/components/SiteStatusBadge.tsx`（入口组件：首帧兜底、60s 轮询、可见性补刷、卸载清理）
- `src/components/SiteSidebar.tsx`（`SiteSidebarBody`：状态入口挂在 `SidebarFooter` 之后，桌面侧栏与移动抽屉共用）
- `src/components/Layout.tsx`（移动抽屉把 `onExternalClick` / `interactionDisabled` 传给侧栏内容体）
- `worker/index.mjs`（Worker 入口：只允许 `export default { fetch }`，不得有任何具名导出）
- `worker/status.mjs`（`GET /api/status` 逻辑与可测试具名导出：Better Stack 代理、Cache API、严格校验）
- `wrangler.jsonc`（`main`、`assets.run_worker_first`、`vars.BETTERSTACK_STATUS_PAGE_ID`）
- `config/site.config.json` / `config/site.config.ts` / `.pages.yml`（`statusPageUrl` 及其 CMS 字段）
- `.env.example`（Worker Secret / Worker 变量 / 前端公开 URL 的说明与占位）
- 测试：`worker/index.test.mjs`、`src/services/siteStatus.test.ts`、`src/components/SiteStatusBadge.test.tsx`

## 修改规则（必须遵守）

1. **兜底优先渲染**：`SiteStatusBadge` 首帧固定 `unavailable`（中性「服务状态」），只在客户端 `useEffect` 里请求真实状态；**不得**在渲染期发请求、读 `window`/`document`/时钟或随机值。SSR/SSG 与客户端水合首帧必须逐字一致。
2. **只有 `operational` 显示绿色**：其余四种展示态各有语义色（degraded 琥珀、downtime 红、maintenance 天蓝、unavailable 中性灰），`unavailable` 既不是「正常」也不是「故障」，**不得**给它绿色、对勾或「正常」类文案。
3. **严格解析上游结果**：只有 `success === true` 且 `status` 属于四种真实状态才更新展示；未知值、字段缺失、非 JSON、坏 JSON、非 2xx（含平台 1027 与 429）、网络断开、请求超时，**一律回退 `unavailable`**，不得抛错、不得显示为正常、不得隐藏入口。Worker 侧 Token/状态页 ID 缺失属于「未配置」，同样直接返回 `unavailable` 且不发上游请求。
4. **入口始终可点击**：状态入口整块是 `<a>`，`target="_blank"` + `rel="noopener noreferrer"`，`aria-label` 说明状态与「在新窗口打开 Better Stack 状态页」；失败、超时、API 被拦截时都必须保留「服务状态」文案与可点击跳转。移动抽屉动画期间的 `interactionDisabled` 只阻止本次跳转（`aria-disabled` + `preventDefault`），**不得**卸载或永久禁用入口。
5. **状态页 URL 独立配置且只接受 https**：取值顺序固定为 `VITE_BETTERSTACK_STATUS_PAGE_URL` → `siteConfig.statusPageUrl` → 站点域名约定默认值；非法值（`http:`、`javascript:`、无协议、空串）一律忽略并回退，**不得**把非法地址写进 `href`。当前 `statusPageUrl` 是站长提供的实际自定义域 `https://status.pldduck.com`；**不得**改回 Better Stack 默认子域，也不要在未做网络可达性验证时声称「已验证可访问」。
6. **Token 不下发浏览器、不进日志**：`BETTERSTACK_API_TOKEN` 只放 Cloudflare Worker Secret（`npx wrangler secret put BETTERSTACK_API_TOKEN`），**禁止**出现在前端代码、`VITE_*` 变量、`config/*.json`、`wrangler.jsonc`、`.env.example` 真实值、响应体、日志、缓存键或任何提交物中。Worker 日志只允许记录通用信息（HTTP 状态码 / 错误名），不得输出 Token、`Authorization` 请求头或上游响应体。发往 Better Stack 的请求必须 `redirect: 'error'`：Token 只允许发往固定 API 源，绝不能因 3xx 跟随到其他源。
7. **Worker 缓存与上游行为固定**：`GET /api/status` 成功结果写入 Cache API **60 秒**（`STATUS_CACHE_TTL_SECONDS`），按 `status_page_id` 分键；上游 Better Stack 请求 **5 秒超时**（`STATUS_UPSTREAM_TIMEOUT_MS`）且**只尝试一次、不重试**；失败结果**绝不写缓存**（不得把故障缓存成后续的成功态）。Worker 对外响应 `Cache-Control: no-store`，另加 `X-Content-Type-Options: nosniff`；**不得**放开 CORS、**不得**下发 Token。缓存键固定为同源 `/api/status?status_page_id=<id>`（只含状态页 ID，不得塞 Token 等敏感信息）；Cache API 的 `match` 不保证按 `max-age` 自动过期，60 秒 TTL 由缓存副本里的内部时间戳判定，改缓存实现**不得只依赖响应头**。
8. **前端刷新与并发固定**：客户端每 **60 秒**刷新一次（与 Worker 缓存对齐），标签页重新可见时补刷一次；同一时刻桌面侧栏与移动抽屉的请求必须合并（模块级 in-flight 去重），请求完成即清空，**不得**做结果缓存（否则轮询会一直拿到旧值）。单次请求 **8 秒**超时；失败不重试。
9. **`/api/status` 契约稳定**：成功 `{ success: true, status: <四态之一>, updatedAt: <ISO> }`；失败 `{ success: false, status: "unavailable" }` 且仍为 HTTP 200（`unavailable` 是接口契约内的兜底值，不是 HTTP 错误）；非 `/api/status` 返回 404，非 GET 返回 405 + `Allow: GET`。`X-Status-Cache: HIT|MISS` 仅作调试用，不得被前端当成状态依据。
10. **Service Worker 不缓存 `/api/*`**：`public/sw.js` 的 fetch 处理器必须在进入导航/静态资源缓存分支前直接放行 `/api/` 请求（当前实现：同源检查后 `getScopedPath(url).startsWith('/api/')` 即 `return`）。否则断网时 SW 会返回上一次缓存的 `operational`，把「无法获取状态」伪装成「服务正常」，直接违反第 3 条。
11. **侧栏交互不得破坏**：入口复用既有导航行类名（`nav-item` / `nav-item-label` / `sidebar-icon`），挂在 `SidebarFooter` 之后；文字在图标条收起态随既有 `opacity` 机制淡出（**不得** `display:none`、不得卸载 DOM、不得改行高）。**不得**为它新增折叠按钮、localStorage 或旁路展开逻辑，也**不得**影响侧栏 hover/键盘展开态、移动抽屉关闭动画与左右滑手势。内容体必须用 `fillHeight` 撑满容器，只有中间导航清单滚动，页脚与状态入口固定在底部（桌面 900px 视口与手机抽屉都不能让入口掉到视口外）。
12. **静态资源不经过 Worker**：`wrangler.jsonc` 的 `assets.run_worker_first` 只允许 `/api/*`；HTML/JS/CSS/图片由 Static Assets 直出。这样 Worker 请求额度耗尽（平台返回 1027 等）时页面仍可加载、状态入口仍渲染静态兜底；**不得**把 `run_worker_first` 改成 `true` 或把全站路由塞进 Worker。若整个 Worker + Static Assets 部署被平台拒绝执行，前端无法绕过——这属于平台侧故障，文档必须如实说明。
13. **测试要求**：改这条链路必须跑并保持以下测试通过（不得为通过而放宽断言）：
    ```bash
    npx vitest run worker/index.test.mjs src/services/siteStatus.test.ts src/components/SiteStatusBadge.test.tsx
    ```
    - Worker 测试须覆盖：四种成功状态、未知值/缺字段/坏 JSON/非 2xx/超时/网络错误的 unavailable 兜底、配置缺失不发上游、Cache 命中/TTL/失败不缓存、404/405、Token 不泄露；
    - 服务层测试须覆盖：URL 优先级与非法值回退、8s 超时、各类失败统一 unavailable、并发去重；
    - 组件测试须覆盖：SSR 首帧与客户端首帧均为中性兜底、只有 operational 才出现绿色、失败时入口仍可点击、60s 轮询与可见性补刷、卸载清理与竞态。

## 常见陷阱

- 为了「好看」把未知/失败状态显示成 `operational` 或绿色对勾 —— 这是本功能最严重的错误：API 故障时误导访客「服务正常」，且违背「失败不得伪装成功」的总则。
- 给前端结果加 localStorage / sessionStorage / 模块级结果缓存：60s 轮询会一直拿到旧值，状态永远不更新。
- 把失败响应写进 Cache API，或把 `Cache-Control` 从 `no-store` 改成可缓存：故障会被固化成对外状态。
- 在客户端直接请求 `incidents.betterstack.com` 或把 Token 塞进 `VITE_*`：Token 立即进入前端产物并公开，且浏览器跨域也拿不到结果。
- 在状态入口里读 `window`/`document`/`Date.now()` 参与首帧渲染：SSG 与水合不一致，首帧可能出现绿色勾选或闪动。
- 把状态入口并入 `siteNav.ts` 的 `navGroups`：那是按路由/外链分组的导航清单，状态入口不是路由页，混入会污染激活判定与顶栏页名解析。
- 改 `wrangler.jsonc` 时顺手把 `run_worker_first` 改成 `true`：静态资源也进 Worker，白耗请求额度，平台限流时整站跟着不可用。
- 忘记在 `.pages.yml` 的 `siteConfig` 集合声明 `statusPageUrl`：CMS 保存配置会静默丢掉该键（`scripts/pagescms-config.test.mjs` 有漂移守卫）。
- 状态页域名 `https://status.pldduck.com` 是站长提供的实际自定义域：不得改回 Better Stack 默认子域；也不要在未做网络可达性验证时声称「已验证可访问」。
- 删掉并发去重或把共享请求改成随组件 abort：桌面侧栏与移动抽屉同时挂载时会出现重复请求 / 互相取消。
- 在 `worker/index.mjs` 里导出常量/普通函数（例如把 `STATUS_PATH`、`handleRequest` 写在入口文件）：
  Workers ESM 入口只接受 `export default { fetch }`（以及 Durable Object 类），其余具名导出会在
  启动时报 `Incorrect type for map entry`；逻辑与具名导出统一放 `worker/status.mjs`，入口只转发。
- 只改 `wrangler.jsonc` 的 `compatibility_date` 而不动 deploy.yml 固定的 wrangler 版本：兼容日期高于
  本地 workerd 支持上限时 `wrangler dev` 直接拒绝启动（当前对齐到 `2026-08-18`）；升级 wrangler
  时两处一起评估。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
