# 首页（个人主页，`/`）— AI 修改规则

## 功能概述

首页是站主的极简个人主页（原 `/about` 已并入本页），自上而下只有四块内容：头像、名字（唯一 `h1`）、
`author.bio` 原文介绍、联系方式（GitHub / 邮箱 `mailto:` / QQ 一键复制）。除此之外不承载任何栏目、
入口或内容列表 —— 2026-11 用户已确认「极简个人主页」方向并删除旧首页的全部导流内容。

**明确禁止恢复的旧内容**：门户入口磁贴与次级链接、站内搜索入口与 `?q=` 处理、开源项目清单、
「关于本站」与折腾记录、技术栈清单、助记词 / tagline / 状态标签、新文章订阅卡（`IssueSubscriptionCard`）、
文章 / 说说 / 友链等任何内容列表。`config/portal.config.json` 仍存在且仍由加载器合并为
`siteConfig.portal`（暂保留，供将来恢复或其他用途），但**首页不再消费**；不要因为它还在就恢复门户渲染。

全站页面底部不再渲染全局 Footer（`Layout` 没有 `Footer` 组件），版权只在侧栏底部；首页不得自己补页脚、
版权或备案信息。

## 关键文件

- `src/pages/Home.tsx`
- `config/site.config.json` 的 `author.avatar` / `author.name` / `author.bio` 与 `social.github` /
  `social.email` / `social.rawEmail` / `social.qq`
- `src/components/Seo.tsx`（`Seo` 与 `buildSiteSchemas`，首页 SEO 与结构化数据）
- `src/utils/clipboard.ts`、`src/hooks/useResetTimer.ts`（QQ 复制与反馈复位）
- `src/utils/siteUrl.ts`（`assetUrl` / `absoluteSiteUrl`）
- `src/pages/Home.test.tsx`（含「旧门户内容不得出现」的负向断言）

## 修改规则（必须遵守）

1. **只允许四块内容**：头像、名字（唯一 `h1`）、`author.bio` 原文、联系方式。新增任何板块都属于扩大
   首页职责，必须先获得用户明确授权并同步本文件；不得以「提高信息密度」「提升导流」为由加回旧内容。
2. **内容来自配置、不硬编码**：名字 / 介绍 / 头像 / 联系方式全部取自 `siteConfig.author` 与
   `siteConfig.social`；不得把个人介绍写进组件，也不得为头像加第三方兜底 —— `assetUrl(siteConfig.author.avatar)`
   已指向站内本地 `public/logo-96.png`，第三方域名（如 ui-avatars）在大陆不可达，站内资源只有构建缺件才失败。
3. **SSG / 水合确定性**：渲染期禁止 fetch、`Date.now()`、`Math.random()`、`window` / `document` 访问；
   复制反馈只能出现在客户端事件之后。SSR 首帧与客户端水合首帧必须逐字一致。
4. **联系方式语义**：GitHub 外链用 `target="_blank"` + `rel="noopener noreferrer"`，可访问名称里标注
   「外部站点，新标签页打开」；邮箱用 `siteConfig.social.email`（`mailto:`）；QQ 只在
   `siteConfig.social.qq` 存在时渲染，点击 `copyTextToClipboard`，成功 / 失败都通过 `role="status"` +
   `aria-live="polite"` 播报，反馈 2 秒后由 `useResetTimer` 复位；卸载后不得再 setState
   （`isMountedRef` 守卫），剪贴板异常必须 try/catch，不产生未处理 rejection。
5. **SEO 保持现状**：`<Seo title={siteConfig.title} description={siteConfig.description} />` —— `title`
   必须逐字等于 `siteConfig.title`，否则 `seoHomeTitle` / `seoHomeDescription` 的首页覆盖不生效
   （见 `Seo.tsx`）；该覆盖只对 `/` 有效，其他页面不得复用 `siteConfig.title` 作为标题。
   首页额外输出 `ProfilePage` schema（站主即站点，原 `/about` 的实体随页面合并）：显式传
   `structuredData` 会**替换**掉 `Seo` 的默认站点 schema，必须
   `[...buildSiteSchemas(...), profilePageSchema]` 一并带上 WebSite + Organization；`buildSiteSchemas`
   的入参要与 `Seo` 对首页选的文案（`seoHomeDescription` 优先）保持一致。`config/routes.mjs` 的 `/`
   条目不得加 `seo.schemaType`，否则 SSG 会再注入一份，`seo-audit` 报「@type 重复」。
6. **无障碍**：头像 `alt` = `author.name`；联系方式区用 `<nav aria-label="联系方式">`；QQ 复制按钮有
   明确的可访问名称（含号码）；复制结果用 `role="status"` 播报；标题层级只有 `h1`，不出现别的标题。
7. **无全局 Footer**：`Layout` 不再渲染页面底部 Footer（版权只在侧栏底部），首页不得补页脚、版权或
   备案信息，也不得在页面内输出 `contentinfo`。
8. **动画克制**：不使用 framer-motion 入场 / 视差动画（首帧必须是最终可见状态，保证 LCP 与无 JS 可读）；
   只允许 CSS `motion-safe:` 级别的小动效。
9. **性能**：组件内 state 仅限 QQ 复制反馈，不得引发整页重渲染；不得重新引入 `preloadPage` 预加载、
   搜索索引或订阅卡等旧逻辑。

## 常见陷阱

- 觉得「首页太素」而加回门户磁贴、搜索框、项目列表、技术栈或订阅卡：这正是被删除的内容，
  改回即违反规则 1（只能先请求用户授权）。
- 看到 `config/portal.config.json` 仍存在，就以为首页还该消费它：它只是历史配置，暂保留 ≠ 恢复渲染。
- 把 `siteConfig.subtitle` / tagline / 状态标签加回英雄区：站点身份已由全站外壳（侧栏 + 顶栏）承担，
  首页不需要再写一遍。
- 作者头像直接用 `/logo-96.png` 裸路径：必须过 `assetUrl()`，子路径部署下否则 404。
- 复制 QQ 用裸 `navigator.clipboard.writeText` 且不处理异常：旧浏览器 / 无权限会抛未处理 rejection，
  必须走 `copyTextToClipboard` + try/catch，并在卸载后跳过 setState。
- 去掉 `ProfilePage` 或只传 `profilePageSchema`：会丢掉 WebSite / Organization，SEO 审计失败。
- 删除 `Home.test.tsx` 里「不存在门户入口 / 搜索框 / 开源项目 / 关于本站 / 订阅卡」的负向断言：
  那些断言在守护这次精简，不是冗余测试。
- 在 `Layout` 或首页里恢复 `<footer>`：全站已无页面底部 Footer，`Layout.test` 会断言 `contentinfo` 不存在。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
