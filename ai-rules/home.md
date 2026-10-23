# 首页（Home，`/`）— AI 修改规则

## 功能概述

站点门户，同时是站主的主页（原 `/about` 已并入本页）。栏目自上而下的顺序是**导流优先**：
站名与自我介绍 + 站内搜索入口（`siteConfig.title` 作 h1、大尺寸头像 128px、助记词、状态徽标、`author.bio` 自述段）
→ 站点入口磁贴与次级链接 → 开源项目 → 「关于本站」栏目（站点折腾记录与技术栈清单，来自 `portal.identity` / `portal.stack`）
→ 联系方式（GitHub / 邮箱 / QQ 一键复制）→ 新文章订阅卡（`IssueSubscriptionCard`）。
「关于本站」放在开源项目之后：它是身份说明而非入口，靠近末尾的联系方式与订阅卡更顺读。

英雄区**不再输出 `siteConfig.subtitle` 小字**：站点身份已经由全站外壳（侧边栏 + 顶栏面包屑）承担，首页只留站名与描述。

**本页不出现任何文章/说说/友链的正文内容列表**（说说页现为 giscus 内嵌，首页同样不得内嵌），也不承载列表的筛选、排序、分页与搜索结果展示：文章列表在
`/posts`（见 `posts.md`），归档/标签/搜索分别在 `/archive`、`/tags`、`/search`。首页只给出指向它们的入口。
站点**自身**的身份文案（自述、折腾记录、技术栈）属于本页职责，不是内容列表。

## 关键文件

- `src/pages/Home.tsx`
- `config/portal.config.json`（入口磁贴、次级链接、开源项目、tagline/status/tags/memory/identity/stack 全部由此驱动；构建期/运行期都合并成 `siteConfig.portal`）与 `config/site.config.ts` 的 `SitePortal` 类型
- `config/site.config.json` 的 `author.bio`（Hero 自述段与 ProfilePage schema 的 mainEntity 共用）
- `src/utils/preload.ts`（磁贴悬停预加载的 chunk 键）
- `src/components/IssueSubscriptionCard.tsx`（首页末尾的订阅卡，与文章页同一组件）

## 修改规则（必须遵守）

1. **纯导流**：不得渲染 `PostCard`、说说 giscus 内嵌、友链头像等任何内容列表；需要新增栏目就加一条 `portal.entries`。搜索表单只做 `navigate('/search?q=…')`；空查询不跳转。站点身份文案（`author.bio`、`portal.identity`、`portal.stack`）是例外——它们描述本站，不是内容列表。
2. **URL 状态最小化**：首页唯一合法 URL 是无参 `/`。挂载时把残留参数清掉（`replace`），`?q=` 则整串转交 `/search`（兼容旧版首页的搜索分享链接）。新增交互不得再引入查询参数。
3. **SSG/水合确定性**：门户文案一律来自构建期内联的 `siteConfig.portal`；渲染期禁止 fetch、`Date.now()`、`Math.random()`、`window`/`document` 访问。
4. **内容不硬编码**：站点入口/次级链接/开源项目与「关于本站」正文都来自 `siteConfig.portal`，新增图标在 `PORTAL_ICONS` 注册并保留 `Sparkles` 兜底；不得把清单抄进组件。在 `portal.config.json` 加字段必须同步在 `.pages.yml` 的 `portalConfig.fields` 声明，否则 PagesCMS 保存时会把它抹掉。
5. **链接语义**：站内路径用 `<Link>` + `onMouseEnter={() => preloadPage(path)}`；外链用 `<a target="_blank" rel="noopener noreferrer">` 并在可访问名称里标注「外部站点」。站内/外链判定统一走 `isInternalPath`（`//` 开头的协议相对地址不算站内）。
6. **SEO**：`<Seo title={siteConfig.title} description={siteConfig.description} />` —— `title` 必须逐字等于 `siteConfig.title`，否则 `seoHomeTitle`/`seoHomeDescription` 的首页覆盖不生效（见 `Seo.tsx`）；该覆盖只对 `/` 有效，其他页面（含 `/posts`）不得复用 `siteConfig.title` 作为标题。
   首页额外输出 `ProfilePage` schema（站主即站点，原 `/about` 的实体随页面合并）：显式传 `structuredData` 会**替换**掉 `Seo` 的默认站点 schema，必须 `[...buildSiteSchemas(...), profilePageSchema]` 一并带上 WebSite + Organization；`buildSiteSchemas` 的入参要与 `Seo` 对首页选的文案（`seoHomeDescription` 优先）保持一致。`config/routes.mjs` 的 `/` 条目不得加 `seo.schemaType`，否则 SSG 会再注入一份，`seo-audit` 报「@type 重复」。
7. **无障碍**：每个 `Section` 用 `aria-labelledby` 指向自身 `h2`；搜索表单 `role="search"` + `<label className="sr-only">`；复制成功通过 `role="status"` 播报；头像保留 `alt`。
8. **动画克制**：不使用 framer-motion 入场/视差动画（首帧必须是最终可见状态，保证 LCP 与无 JS 可读）；只允许 CSS `motion-safe:` 级别的小动效。
9. **性能**：组件内 state 仅限局部交互（搜索输入框、复制反馈），不得引发整页重渲染。

## 常见陷阱

- 作者头像取自 `siteConfig.author.avatar`（现为站内本地 `/logo-96.png`），渲染必须过 `assetUrl()`（子路径部署下裸相对路径会 404）。曾经的 ui-avatars 首字母兜底已删除：那是第三方域名，大陆命中不了，而站内资源只有构建缺件才会失败 —— 别为它再加一个 `onError` 状态。
- 首屏最大的封面图 preload 属于 `/posts`（`scripts/ssg.mjs` 里按 `page.path === 'posts'` 注入）：搬到首页会让 Chrome 报「preloaded 但未使用」，因为首页已经没有文章卡片了。
- 页脚由 `Layout` 统一渲染，首页不得重复输出。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
