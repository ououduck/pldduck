# 首页（个人主页，`/`）— AI 修改规则

## 功能概述

首页 = 极简个人主页 + 全站搜索 + 联系方式/订阅入口（原 `/about` 已并入本页）。自上而下固定为：Hero 面板内的头像、名字（唯一 `h1`）、`author.bio` 原文、全站搜索表单（pill 输入 + 「搜索」按钮，回车/提交 → `/search?q=`）、联系方式区（GitHub / 邮箱 `mailto:` / QQ 一键复制 / RSS 订阅 / 更新订阅 / 项目仓库）。仍**不**承载门户入口、文章/说说/友链等内容列表、技术栈、关于本站、状态标签或订阅卡。

视觉：桌面（≥768px）Hero 是 `home-hero` 的 surface 大色块卡片 + 低对比径向光（`home-hero-glow`），内容用 CSS staggered reveal 按 avatar → title → bio → search → contact 的顺序入场；移动端（<768px）去掉卡片外观、内容铺满可用视口且禁止上下滚动，联系方式收成 2 列紧凑网格。`prefers-reduced-motion` 下动效直接可见。

2026-11 用户确认把侧栏「订阅与联系」分组整体迁到首页：侧栏只保留导航与工具，首页承担全站搜索与联系/订阅入口；不要因为旧规则写过「首页不得有搜索」就把它删掉或搬回侧栏。

**明确禁止恢复的旧内容**：门户入口磁贴与次级链接、开源项目清单、「关于本站」与折腾记录、技术栈清单、助记词 / tagline / 状态标签、新文章订阅卡（`IssueSubscriptionCard` 组件本体）、文章 / 说说 / 友链等任何内容列表。`config/portal.config.json` 仍存在且仍由加载器合并为 `siteConfig.portal`（暂保留），但**首页不再消费**；不要因为它还在就恢复门户渲染。

全站页面底部不再渲染全局 Footer（`Layout` 没有 `Footer` 组件），版权只在侧栏底部；首页不得自己补页脚、
版权或备案信息。

## 关键文件

- `src/pages/Home.tsx`
- `src/index.css`（`.home-hero` / `.home-hero-glow` / `.home-reveal` 的 Hero 与 staggered reveal，含 reduced-motion 分支；`@media (max-width: 767.98px)` 的 `.home-page` 全屏、`:has(.home-page)` 滚动锁与 `.home-contact-grid` 2 列网格）
- `config/site.config.json` 的 `author.avatar` / `author.name` / `author.bio` 与 `social.github` /
  `social.email` / `social.rawEmail` / `social.qq`
- `src/components/IssueSubscriptionCard.tsx`（只取导出的 `ISSUE_SUBSCRIPTION_URL` 常量做「更新订阅」外链，**不渲染卡片**）
- `src/components/Seo.tsx`（`Seo` 与 `buildSiteSchemas`，首页 SEO 与结构化数据）
- `src/utils/clipboard.ts`、`src/hooks/useResetTimer.ts`（QQ 复制与反馈复位）
- `src/utils/siteUrl.ts`（`assetUrl` / `absoluteSiteUrl`）
- `src/pages/Home.test.tsx`（含「旧门户内容不得出现」与搜索/联系入口的断言）

## 修改规则（必须遵守）

1. **允许的内容边界**：头像、名字（唯一 `h1`）、`author.bio` 原文、全站搜索表单、联系方式区（GitHub / 邮箱 / QQ 复制 / RSS / 更新订阅 / 项目仓库）。新增任何别的板块（门户磁贴、内容列表、技术栈、订阅卡等）都属于扩大首页职责，必须先获得用户明确授权并同步本文件；不得以「提高信息密度」「提升导流」为由加回旧内容。
2. **内容来自配置、不硬编码**：名字 / 介绍 / 头像 / 联系方式全部取自 `siteConfig.author` 与
   `siteConfig.social`；不得把个人介绍写进组件，也不得为头像加第三方兜底 —— `assetUrl(siteConfig.author.avatar)`
   已指向站内本地 `public/logo-96.png`，第三方域名（如 ui-avatars）在大陆不可达，站内资源只有构建缺件才失败。
3. **SSG / 水合确定性**：渲染期禁止 fetch、`Date.now()`、`Math.random()`、`window` / `document` 访问；搜索输入初值固定空字符串，复制反馈只能出现在客户端事件之后。SSR 首帧与客户端水合首帧必须逐字一致。
4. **联系方式与订阅语义**：GitHub / 更新订阅 / 项目仓库外链用 `target="_blank"` + `rel="noopener noreferrer"`，可访问名称里标注「外部站点，新标签页打开」；邮箱用 `siteConfig.social.email`（`mailto:`）；RSS 用 `assetUrl('/feed.xml')`（站内资源，**不**加 `target`）；「更新订阅」的 href 必须取 `ISSUE_SUBSCRIPTION_URL` 常量，**不得**在首页硬编码 Issue URL；QQ 只在 `siteConfig.social.qq` 存在时渲染，点击 `copyTextToClipboard`，成功 / 失败都通过 `role="status"` + `aria-live="polite"` 播报，反馈 2 秒后由 `useResetTimer` 复位；卸载后不得再 setState（`isMountedRef` 守卫），剪贴板异常必须 try/catch，不产生未处理 rejection。首页只放「更新订阅」文字入口，**不得**渲染 `IssueSubscriptionCard` 卡片本体。
5. **SEO 保持现状**：`<Seo title={siteConfig.title} description={siteConfig.description} />` —— `title`
   必须逐字等于 `siteConfig.title`，否则 `seoHomeTitle` / `seoHomeDescription` 的首页覆盖不生效
   （见 `Seo.tsx`）；该覆盖只对 `/` 有效，其他页面不得复用 `siteConfig.title` 作为标题。
   首页额外输出 `ProfilePage` schema（站主即站点，原 `/about` 的实体随页面合并）：显式传
   `structuredData` 会**替换**掉 `Seo` 的默认站点 schema，必须
   `[...buildSiteSchemas(...), profilePageSchema]` 一并带上 WebSite + Organization；`buildSiteSchemas`
   的入参要与 `Seo` 对首页选的文案（`seoHomeDescription` 优先）保持一致。`config/routes.mjs` 的 `/`
   条目不得加 `seo.schemaType`，否则 SSG 会再注入一份，`seo-audit` 报「@type 重复」。
6. **无障碍**：头像 `alt` = `author.name`；搜索表单用 `role="search"` + `<label className="sr-only">`（`htmlFor` 指向输入框 id），输入框有可访问名称；联系方式区用 `<nav aria-label="联系方式">`；QQ 复制按钮有明确的可访问名称（含号码）；复制结果用 `role="status"` 播报；标题层级只有 `h1`，不出现别的标题。
7. **无全局 Footer**：`Layout` 不再渲染页面底部 Footer（版权只在侧栏底部），首页不得补页脚、版权或
   备案信息，也不得在页面内输出 `contentinfo`。
8. **Hero 与入场动效**：Hero 是 `home-hero` surface 大色块 + `home-hero-glow` 低对比径向光；内容用 CSS `.home-reveal` + `data-home-reveal` 按 `--home-reveal-delay` 依次入场（avatar → title → bio → search → contact）。**不得**改用 framer-motion / JS 控制显隐或延迟挂载；`@media (prefers-reduced-motion: reduce)` 下必须 `animation: none` 直接可见；动画不得让 LCP 元素长期不可见、不得引发布局位移，也不得在 SSR 首帧输出 `opacity: 0` 的内联样式。
9. **性能**：组件内 state 仅限搜索输入与 QQ 复制反馈，不得引发整页重渲染；不得重新引入 `preloadPage` 预加载、文章搜索索引、搜索建议/结果预览或订阅卡等旧逻辑。
10. **全站搜索行为**：表单提交时 `trim()` 查询——空查询跳 `/search`，非空跳 `/search?q=<encodeURIComponent>`；首页**只**做跳转，不请求索引、不渲染结果、不打开命令面板、不处理 `?q=` URL 参数（搜索体验在 `/search`，见 [搜索](search.md)）。搜索输入是 pill 容器内的受控输入（`bg-surface-muted`），只做受控输入，不参与首帧渲染、不做防抖/联想（那是搜索页的职责）。
11. **移动端全屏（<768px）**：`@media (max-width: 767.98px)` 下 `.home-page` 撑满可用视口（`100dvh` + flex），`.home-hero` 去掉边框/圆角/背景并让内容居中；`html:has(.home-page)` 与 `body:has(.home-page)` 设 `overflow: hidden` + `overscroll-behavior: none`，`.site-shell:has(.home-page)` 同时固定高度与 overflow。**滚动锁只能靠 `:has` CSS**：离开首页后选择器自动失效、滚动自然恢复，**不得**用 JS 写/清 `body` overflow，也不得把 `overflow:hidden` 挂到全站 html/body；搜索、QQ 复制、复制结果播报必须仍可用。联系方式用 `.home-contact-grid` 2 列紧凑网格（桌面恢复横向 flex 行）。

## 常见陷阱

- 觉得「首页太素」而加回门户磁贴、项目列表、技术栈或订阅卡：这正是被删除的内容，
  改回即违反规则 1（只能先请求用户授权）。
- 把 Hero reveal 改成 framer-motion/JS 延迟挂载，或删掉 `prefers-reduced-motion` 分支：
  无 JS/弱动效用户会看到空白或错落入场；动画必须纯 CSS 且尊重 reduced-motion。
- 恢复浅色/主题切换（ThemeToggle、localStorage.theme、`dblog:toggle-theme`）：全站已深色唯一，
  恢复会把首页 Hero 的 surface 色块与 Token 打回两套来源（见 [主题系统](theme.md)）。
- 用 JS（useEffect 写 body.style.overflow）锁首页滚动，或把 `overflow:hidden` 写到全局 html/body：
  移动端离开首页会滚不动；滚动锁必须留在 `html:has(.home-page), body:has(.home-page)` 的多媒体查询里。
- 把桌面 Hero 卡片（边框/圆角/背景）带回 <768px，或把联系方式改成单列：移动首页已定稿为无卡片、
  内容铺满视口、联系方式 2 列；同时确保搜索/QQ/状态提示仍在首屏可用。
- 把首页搜索做成「输入即出结果」的内嵌搜索、搜索建议或命令面板：首页只负责跳到 `/search?q=`，
  搜索评分/防抖/结果列表都在 `/search`（见 [搜索](search.md)）；首页内嵌结果会让 SSG 首帧与
  `?q=` 直访语义混乱。
- 把「更新订阅」写成硬编码 URL 或渲染 `IssueSubscriptionCard`：统一用 `ISSUE_SUBSCRIPTION_URL`
  常量做文字入口，卡片会引入订阅表单逻辑，超出首页职责。
- 删掉 RSS / 更新订阅 / 项目仓库、或把联系方式搬回侧栏「订阅与联系」分组：这些入口已由用户确认
  统一放在首页，侧栏只保留导航与工具（见 [布局与导航](layout-nav.md)）。
- 看到 `config/portal.config.json` 仍存在，就以为首页还该消费它：它只是历史配置，暂保留 ≠ 恢复渲染。
- 把 `siteConfig.subtitle` / tagline / 状态标签加回英雄区：站点身份已由全站外壳（侧栏 + 顶栏）承担，
  首页不需要再写一遍。
- 作者头像直接用 `/logo-96.png` 裸路径：必须过 `assetUrl()`，子路径部署下否则 404。
- 复制 QQ 用裸 `navigator.clipboard.writeText` 且不处理异常：旧浏览器 / 无权限会抛未处理 rejection，
  必须走 `copyTextToClipboard` + try/catch，并在卸载后跳过 setState。
- 去掉 `ProfilePage` 或只传 `profilePageSchema`：会丢掉 WebSite / Organization，SEO 审计失败。
- 删除 `Home.test.tsx` 里「不存在门户入口 / 开源项目 / 关于本站 / 订阅卡」的负向断言，
  或删掉搜索表单与联系方式入口的断言：前者在守护这次精简，后者在守护搜索/联系迁移，都不是冗余测试。
- 在 `Layout` 或首页里恢复 `<footer>`：全站已无页面底部 Footer，`Layout.test` 会断言 `contentinfo` 不存在。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
