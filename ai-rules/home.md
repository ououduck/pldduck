# 首页（个人主页，`/`）— AI 修改规则

## 功能概述

首页 = 站主身份 + 全站搜索 + 联系方式/订阅入口 + 访问统计 + 内容小部件（Bento 布局）。
原 `/about` 已并入本页。

七张卡片（DOM 顺序 = 手机端纵向顺序 = 桌面端自动排布顺序）：

1. **名片卡**（`home-profile`，内部 `h1` 唯一）：头像、名字、`author.role`、`author.bio` 原文、全站搜索表单；
2. **访问统计**（`home-stats`）：Vercount 三项计数（总访问量 `site_pv` / 总访客数 `site_uv` /
   本页阅读量 `page_pv`）+ 构建期文章数与累计字数；
3. **推荐阅读**（`home-featured`）：按 `updatedAt || date` 降序的**最近 3 篇**（标题 + 摘要 + 分类/日期/时长），
   卡片右上角「看看文章 →」入口指向 `/posts`；
4. **写作档案**（`home-writing`）：累计篇数、锚点年份篇数、近 12 个月纯 CSS 柱状图、最早文章日期；
5. **联系方式**（`home-contact`）：GitHub / 邮箱 / QQ 一键复制 / RSS / 更新订阅 / 项目仓库；
6. **标签**（`home-tags`）：按文章数降序的前 8 个热门标签（`/posts?tag=`），底部「共 N 个标签」；
7. **服务状态**（`home-status`）：订阅全局 `siteStatusStore`，首帧中性、始终可点击跳转状态页。

卡片外观统一走既有 Token：`rounded-overlay bg-surface` + `text-content` / `text-content-muted` / `line`，
与全站卡片同一套配色（见 [主题系统](theme.md)）。仍**不**承载门户入口、文章/说说/友链等整页内容列表、
技术栈、关于本站、订阅卡本体或状态标签。

2026-11 用户确认把侧栏「订阅与联系」分组整体迁到首页：侧栏只保留导航与工具，首页承担全站搜索与
联系/订阅入口；不要因为旧规则写过「首页不得有搜索」就把它删掉或搬回侧栏。

2026-11（第二轮改版）用户明确要求首页改为**小部件布局**，并授权破例：手机端改为上下滑动看卡片
（不再禁止滚动）、允许出现推荐阅读/标签/写作档案这类内容小部件、卡片标题使用 `h2`。
当时一并确认：**Vercount 公开接口没有「今日」维度**，统计卡只展示真实三项 + 构建期数字，
不得自造或推算「今日访问量 / 今日访客数」。

**明确禁止恢复的旧内容**：门户入口磁贴与次级链接、开源项目清单、「关于本站」与折腾记录、
技术栈清单、助记词 / tagline / 状态标签、新文章订阅卡（`IssueSubscriptionCard` 组件本体）。
`config/portal.config.json` 仍存在且仍由加载器合并为 `siteConfig.portal`（暂保留），但**首页不再消费**；
不要因为它还在就恢复门户渲染。

全站页面底部不再渲染全局 Footer（`Layout` 没有 `Footer` 组件），版权只在侧栏底部；首页不得自己补页脚、
版权或备案信息。

## 关键文件

- `src/pages/Home.tsx`（只负责 `Seo` + 网格容器，具体卡片在 `src/components/home/`）
- `src/components/home/Widget.tsx`（卡片外壳：标题 `h2`、右上角入口、`data-home-reveal="card-N"`）
- `src/components/home/ProfileWidget.tsx` / `StatsWidget.tsx` / `FeaturedPostsWidget.tsx` /
  `WritingWidget.tsx` / `ContactWidget.tsx` / `TagsWidget.tsx` / `StatusWidget.tsx`
- `src/services/homeStats.ts`（构建期统计：文章数、字数、近 12 月柱状图、标签、推荐阅读、锚点年月）
- `src/services/posts.ts`（`getInitialPosts()`：构建期内联文章元数据）
- `src/services/vercount.ts`（`fillVercountSpans()` 供统计卡挂载时补一次缓存回填）
- `src/index.css`（`.home-page` / `.home-widgets` 网格、`.home-widget-glow`、`.home-reveal` 的卡片级
  stagger 与 reduced-motion 分支）
- `config/site.config.json` 的 `author.avatar` / `author.name` / `author.role` / `author.bio` 与
  `social.github` / `social.email` / `social.rawEmail` / `social.qq`
- `src/components/IssueSubscriptionCard.tsx`（只取导出的 `ISSUE_SUBSCRIPTION_URL` 常量做「更新订阅」外链，
  **不渲染卡片**）
- `src/components/Seo.tsx`（`Seo` 与 `buildSiteSchemas`，首页 SEO 与结构化数据）
- `src/utils/clipboard.ts`、`src/hooks/useResetTimer.ts`（QQ 复制与反馈复位）
- `src/utils/siteUrl.ts`（`assetUrl` / `absoluteSiteUrl`）
- `src/pages/Home.test.tsx` / `src/services/homeStats.test.ts`

## 修改规则（必须遵守）

1. **允许的内容边界**：七张卡片的内容如上；新增/删除卡片、改变卡片内容都必须先获得用户明确授权并
   同步本文件。推荐阅读**只放 3 篇**且只有标题/摘要/分类/日期/时长，不带封面、分页或卡片式交互；
   完整列表能力属于 `/posts`。标签卡只展示前 8 个热门标签；写作档案只是统计，不是归档时间线。
2. **内容来自配置与构建期数据、不硬编码**：名字 / 介绍 / 身份 / 头像 / 联系方式全部取自
   `siteConfig.author` 与 `siteConfig.social`；文章、标签、月度统计一律由 `getHomeStats()` 从
   `getInitialPosts()` 派生。不得把个人介绍写进组件，也不得为头像加第三方兜底 ——
   `assetUrl(siteConfig.author.avatar)` 已指向站内本地 `public/logo-96.png`。
3. **SSG / 水合确定性**：渲染期禁止 fetch、`Date.now()`、`Math.random()`、`window` / `document` 访问；
   **「近 12 个月」「本年」必须锚定最新一篇文章的年月**（`getHomeStats()` 已如此实现），不得改用当前时钟
   —— 否则每次构建产物都漂移、SSR 与客户端首帧也对不上。锚点年份要在界面上显式写出（如「2026 年」），
   不要说成「今年」。搜索输入初值固定空字符串，复制反馈只能出现在客户端事件之后。
4. **联系方式与订阅语义**：GitHub / 更新订阅 / 项目仓库外链用 `target="_blank"` + `rel="noopener noreferrer"`，
   可访问名称里标注「外部站点，新标签页打开」；邮箱用 `siteConfig.social.email`（`mailto:`）；
   RSS 用 `assetUrl('/feed.xml')`（站内资源，**不**加 `target`）；「更新订阅」的 href 必须取
   `ISSUE_SUBSCRIPTION_URL` 常量，**不得**在首页硬编码 Issue URL；QQ 只在 `siteConfig.social.qq` 存在时渲染，
   点击 `copyTextToClipboard`，成功 / 失败都通过 `role="status"` + `aria-live="polite"` 播报，
   反馈 2 秒后由 `useResetTimer` 复位；卸载后不得再 setState（`isMountedRef` 守卫），剪贴板异常必须
   try/catch，不产生未处理 rejection。首页只放「更新订阅」文字入口，**不得**渲染 `IssueSubscriptionCard`。
5. **SEO 保持现状**：`<Seo title={siteConfig.title} description={siteConfig.description} />` —— `title`
   必须逐字等于 `siteConfig.title`，否则 `seoHomeTitle` / `seoHomeDescription` 的首页覆盖不生效
   （见 `Seo.tsx`）；该覆盖只对 `/` 有效，其他页面不得复用 `siteConfig.title` 作为标题。
   首页额外输出 `ProfilePage` schema（站主即站点，原 `/about` 的实体随页面合并）：显式传
   `structuredData` 会**替换**掉 `Seo` 的默认站点 schema，必须
   `[...buildSiteSchemas(...), profilePageSchema]` 一并带上 WebSite + Organization；`buildSiteSchemas`
   的入参要与 `Seo` 对首页选的文案（`seoHomeDescription` 优先）保持一致。`config/routes.mjs` 的 `/`
   条目不得加 `seo.schemaType`，否则 SSG 会再注入一份，`seo-audit` 报「@type 重复」。
6. **无障碍**：头像 `alt` = `author.name`；名字是**全页唯一 `h1`**（在名片卡内），其余卡片标题用 `h2`
   （`Widget` 通过 `aria-labelledby` 关联），不得出现跳级标题；搜索表单用 `role="search"` +
   `<label className="sr-only">`（`htmlFor` 指向输入框 id）；联系方式区用 `<nav aria-label="联系方式">`；
   QQ 复制按钮有明确的可访问名称（含号码）；复制结果用 `role="status"` 播报；写作档案柱状图用
   `role="img"` + `aria-label` 给出文字摘要（图形不可读时也不能丢信息）。
7. **无全局 Footer**：`Layout` 不再渲染页面底部 Footer（版权只在侧栏底部），首页不得补页脚、版权或
   备案信息，也不得在页面内输出 `contentinfo`。
8. **入场动效**：只用 CSS `.home-reveal` + `data-home-reveal="card-N"`（`index.css` 里按卡号固定
   `--home-reveal-delay`，0 → 360ms，每张 +60ms）。**不得**改用 framer-motion / JS 控制显隐或延迟挂载；
   `@media (prefers-reduced-motion: reduce)` 下必须 `animation: none` 直接可见；动画不得让 LCP 元素
   长期不可见、不得引发布局位移，也不得在 SSR 首帧输出 `opacity: 0` 的内联样式。
9. **性能**：`getHomeStats()` 有模块级缓存，不要在渲染期重排文章元数据、不要每次渲染重新 `sort`；
   组件内 state 只允许搜索输入、QQ 复制反馈与服务状态快照；不得引入文章搜索索引、搜索建议/结果预览、
   `preloadPage` 预加载或订阅卡等旧逻辑；柱状图是纯 CSS，不得引入图表库。
10. **全站搜索行为**：表单提交时 `trim()` 查询——空查询跳 `/search`，非空跳 `/search?q=<encodeURIComponent>`；
    首页**只**做跳转，不请求索引、不渲染结果、不打开命令面板、不处理 `?q=` URL 参数
    （搜索体验在 `/search`，见 [搜索](search.md)）。
11. **布局（网格与断点）**：`.home-widgets` 在 `index.css` 里定义三种列数 —— 手机单列（默认）、
    `≥1024px` 6 列、`≥1280px` 12 列；各卡片的 `lg:col-span-*` / `xl:col-span-*` / `xl:row-span-*`
    负责跨列跨行，桌面恰好一屏铺满（1440×900 无需滚动）。**手机端 `<1024px` 是单列纵向滚动**：
    禁止恢复「首页禁止滚动」的写法（`html:has(.home-page)` / `body:has(.home-page)` 的
    `overflow: hidden`、`.site-shell:has(.home-page)` 的固定高度），也不得用 JS 写/清
    `body.style.overflow`；`.home-page` 必须保留底部
    `calc(... + env(safe-area-inset-bottom) + var(--cookie-notice-height))` 留白，保证最后一张卡片不被
    Cookie 提示浮层遮住。桌面宽度：Layout 的路由容器默认 `max-w-7xl`，首页用
    `.site-shell main > div:has(.home-page) { max-width: none }` 独占整列宽度，离开首页自动失效。
12. **访问统计卡**：三个计数只读 Vercount 公开接口返回的 `site_pv` / `site_uv` / `page_pv`
    （`#vercount_value_*` 锚点必须保留，`Layout` 的路由级 `pingVercount` 负责上报与回填，
    卡片挂载时用 `fillVercountSpans()` 补一次缓存）。**不得**显示或推算「今日」数据（接口没有该维度）；
    上报失败时服务层把「加载中」换成「—」，不得伪装成 0 或删除卡片。
13. **服务状态卡**：与 `SiteStatusBadge` 同一语义（见 [服务状态](site-status.md)）—— 首帧中性
    「服务状态」（`unavailable`）、只在客户端订阅、只有 `operational` 显示绿色、任何失败回退中性、
    入口始终可点击跳转状态页；只订阅不请求，不得自己起 timer 或加缓存。

## 常见陷阱

- 觉得「首页太素」而加回门户磁贴、项目列表、技术栈或订阅卡：这正是被删除的内容，
  改回即违反规则 1（只能先请求用户授权）。
- 把推荐阅读扩成文章列表（加封面/分页/更多篇）：推荐卡固定 3 篇、只有文字行；列表能力属于 `/posts`。
- 给「推荐阅读」「写作档案」改成 fetch 文章数据、按当前时间过滤或每次渲染重新排序：必须用
  `getHomeStats()`（`getInitialPosts()` + 模块级缓存），否则 SSR/水合不一致、首帧顺序漂移。
- 把「近 12 个月」「本年」改成 `new Date()` 计算：构建时刻会漂移，等于把构建时间写进产物；
  锚点必须是数据字段（最新文章的年月）。
- 在统计卡里显示「今日访问量 / 今日访客数」或把 `site_pv` 差值当今日：Vercount 没有日维度，
  这是编数据，直接违反「失败不得伪装成功」。
- 把 `Widget` 的标题改成 `h3`/`div`：卡片标题必须是 `h2`（`h1` 只有名片卡的名字），
  `Home.test` 断言层级与 `aria-labelledby`。
- 把 reveal 改成 framer-motion / JS 延迟挂载，或删掉 `prefers-reduced-motion` 分支：
  无 JS/弱动效用户会看到空白或错落入场；动画必须纯 CSS 且尊重 reduced-motion。
- 用 JS（useEffect 写 body.style.overflow）锁首页滚动、或把 `:has(.home-page)` 的滚动锁加回来：
  手机端就滑不动了 —— 现在的产品定义是一屏一卡、纵向滑到底。
- 给 `.home-page` 去掉底部 `safe-area + --cookie-notice-height` 留白：最后一张卡片会被 Cookie 提示
  或浏览器底栏盖住。
- 让首页回到 `max-w-3xl` / `max-w-7xl`：桌面会重新变成窄条，不再铺满；宽度放宽只能通过
  `.site-shell main > div:has(.home-page)` 这条首页专属规则。
- 恢复浅色/主题切换（ThemeToggle、localStorage.theme、`dblog:toggle-theme`）：全站已深色唯一。
- 把首页搜索做成「输入即出结果」的内嵌搜索、搜索建议或命令面板：首页只负责跳到 `/search?q=`。
- 把「更新订阅」写成硬编码 URL 或渲染 `IssueSubscriptionCard`：统一用 `ISSUE_SUBSCRIPTION_URL`。
- 删掉 RSS / 更新订阅 / 项目仓库、或把联系方式搬回侧栏「订阅与联系」分组：这些入口已由用户确认
  统一放在首页（规则 4）。
- 看到 `config/portal.config.json` 仍存在，就以为首页还该消费它：它只是历史配置，暂保留 ≠ 恢复渲染。
- 作者头像直接用 `/logo-96.png` 裸路径：必须过 `assetUrl()`，子路径部署下否则 404。
- 复制 QQ 用裸 `navigator.clipboard.writeText` 且不处理异常：旧浏览器 / 无权限会抛未处理 rejection。
- 去掉 `ProfilePage` 或只传 `profilePageSchema`：会丢掉 WebSite / Organization，SEO 审计失败。
- 删除 `Home.test.tsx` 里的负向断言（不存在门户入口 / 开源项目 / 关于本站 / 订阅卡、不出现「今日」），
  或删掉搜索、联系方式、统计锚点与卡片顺序的断言：它们分别在守护本轮改版与上一轮精简。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；
> 在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
