# Clarity 访问分析（index.html）— AI 修改规则

## 功能概述

Microsoft Clarity（项目 ID：`yk9n836sio`）通过 `index.html` 中的官方异步脚本接入，用于访问行为分析；Vercount 负责访问计数展示（文章页阅读量、站点访问量等）。Vercount 不使用官方 `<script>` 标签：官方脚本在 React 渲染前执行且整页只跑一次，SPA 路由切换不会计数、计数位也不显示，因此由 `src/services/vercount.ts` 在路由变化时调用同一套接口（`POST https://events.vercount.one/api/v2/log`）并回填计数 span。该接口未在官网文档中单独列出（随 `events.vercount.one/js` 一起发布，按 host + path 计数），不可用时页面把占位显示为「—」并静默降级，不阻塞页面。

## 关键文件

- `index.html` — Clarity 官方标签的唯一注入位置，项目 ID 直接写在标签中
- `public/_headers` — CSP 同步放行 Clarity 脚本与数据上报域名（Workers Static Assets 读取该文件）
- `scripts/audit-build.mjs` — 构建审计 Clarity 脚本 URL、项目 ID 和 CSP
- `scripts/security-headers.test.mjs` — CSP 源清单的静态契约（含 `scripts.clarity.ms` 回归）
- `src/index.css` 的 `.nav-item` 配色与 `--color-text-*` Token — 侧栏/顶栏可读性由对比度测试守护
- `src/components/CookieNotice.tsx` — 访问分析隐私提示
- `src/services/vercount.ts` — Vercount 计数上报与 span 回填（应用内调用，见上文为何不用官方 script）

## 修改规则（必须遵守）

1. **使用官方标签**：Clarity 脚本保持官方异步注入形态，项目 ID 为 `yk9n836sio`。
2. **唯一入口**：统计脚本只在 `index.html` 注入，不在 React 组件、配置文件或环境变量中重复维护。**唯一例外是经用户批准的 Vercount**：它由 `src/services/vercount.ts` 在应用内经 `POST https://events.vercount.one/api/v2/log` 上报并回填，原因是官方 `<script defer src="https://events.vercount.one/js">` 在 React 渲染前执行且整页只跑一次（首次访问取不到计数 span，SPA 路由切换既不计数也不回填）；**不得**为了「回到官方接法」把该 script 加回 `index.html`。
3. **同步审计**：修改脚本 URL、项目 ID或注入形态时，同步更新 `scripts/audit-build.mjs`。
4. **CSP 同步**：更新 `public/_headers` 的 CSP，`script-src` 放行 `https://www.clarity.ms` **和 `https://scripts.clarity.ms`**，`connect-src` 放行 Clarity 上报域名（`https://www.clarity.ms`、`https://*.clarity.ms`）。两个脚本源缺一不可：`index.html` 只引用 `www.clarity.ms/tag/<id>` 引导脚本，真正的追踪脚本由 `scripts.clarity.ms/<版本>/clarity.js` 下发 —— 只放行 www 时脚本会被 `script-src` 拦截、Clarity 整站失效（2026-11 线上控制台实测报错），`scripts/security-headers.test.mjs` 与 `scripts/audit-build.mjs` 都按此断言。
5. **不混改统计**：Vercount 只负责访问计数，改动 Clarity 时不得牵动 `src/services/vercount.ts`。

## 相关：Cloudflare Web Analytics（边缘注入，仓库里没有引用）

`https://static.cloudflareinsights.com/beacon.min.js` 由 Cloudflare 边缘在 HTML 末尾**自动注入**，
源码/配置里都搜不到它的 URL，RUM 数据上报到 `https://cloudflareinsights.com`。因此：

- CSP 必须在 `script-src` 放行 `https://static.cloudflareinsights.com`、在 `connect-src` 放行
  `https://cloudflareinsights.com`，否则每次加载都会在控制台留一条「违反 CSP 指令」的拦截记录
  （2026-11 与 Clarity 一起被报出来）。
- 关闭 Cloudflare 控制台的 Web Analytics 后，可同步删掉这两个源与 `public/_headers` 里的注释；
  但**不要**为了消除报错而把整段 CSP 放宽成 `https:` 通配。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须先向用户说明理由并请求授权；在获得用户明确准许之前，不得违反规则实现功能或修改本文件。
