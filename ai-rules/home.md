# 首页（Home）— AI 修改规则

## 功能概述

站点导流门户页：站名与自我介绍（含助记词、状态徽标）、站内搜索入口（仅负责跳转）、站点入口磁贴与次级链接、开源项目、继续阅读、最新文章卡片、最近说说摘要、友情链接速览、联系方式（GitHub / 邮箱 / QQ 一键复制）。

**本页不承载文章列表的筛选、排序、分页与搜索结果展示**——那些能力属于 `/archive`、`/tags`、`/search`。

## 关键文件

- `src/pages/Home.tsx`
- `config/site.config.json` 的 `portal` 字段（入口磁贴、次级链接、开源项目、tagline/status/tags/memory 全部由此驱动）与 `config/site.config.ts` 的 `SitePortal` 类型
- `src/services/posts.ts` / `shuoshuo.ts` / `friends.ts`（构建期内联数据的同步 getter）
- `src/components/PostCard.tsx`（与搜索/归档共用卡片，已 React.memo）
- `src/utils/postSorting.ts`（`sortPosts`：置顶精选 → 普通精选 → 时间序）

## 修改规则（必须遵守）

1. **导流页定位**：不得在首页重新实现分类筛选、排序、分页或客户端搜索。搜索表单只做 `navigate('/search?q=…')`；空查询不跳转。
2. **URL 状态最小化**：首页唯一合法 URL 是无参 `/`。挂载时把残留参数清掉（`replace`），`?q=` 则整串转交 `/search`（兼容旧版首页的搜索分享链接）。新增交互不得再引入查询参数。
3. **SSG/水合确定性**：数据一律来自 `getInitialPosts()` / `getInitialShuoShuo()` / `getInitialFriends()` 的同步返回值；列表派生（排序、截取、过滤已失联友链）写在**模块作用域**只算一次。渲染期禁止 fetch、`Date.now()`、`Math.random()`、`window`/`document` 访问（`ShareModal` 的 `window.location.origin` 只在弹层打开时求值）。
4. **内容不硬编码**：站点入口/次级链接/开源项目来自 `siteConfig.portal`，新增图标在 `PORTAL_ICONS` 注册并保留 `Sparkles` 兜底；不得把清单抄进组件。
5. **链接语义**：站内路径用 `<Link>` + `onMouseEnter={() => preloadPage(path)}`；外链用 `<a target="_blank" rel="noopener noreferrer">` 并在可访问名称里标注「外部站点」。站内/外链判定统一走 `isInternalPath`（`//` 开头的协议相对地址不算站内）。
6. **SEO**：`<Seo title={siteConfig.title} description={siteConfig.description} />` —— `title` 必须逐字等于 `siteConfig.title`，否则 `seoHomeTitle`/`seoHomeDescription` 的首页覆盖不生效（见 `Seo.tsx`）。
7. **无障碍**：每个 `Section` 用 `aria-labelledby` 指向自身 `h2`；搜索表单 `role="search"` + `<label className="sr-only">`；复制成功通过 `role="status"` 播报；头像保留 `alt`。
8. **动画克制**：不使用 framer-motion 入场/视差动画（首帧必须是最终可见状态，保证 LCP 与无 JS 可读）；只允许 CSS `motion-safe:` 级别的小动效。
9. **性能**：`PostCard` 保持 memo；组件内 state 仅限局部交互（搜索输入框、复制反馈、头像回退），不得引发整页重渲染。
10. **继续阅读**：与 `useReadingHistory` 保持一致，文章已从列表消失时必须清掉该条历史；阅读完成（`isReadingComplete`）不展示。
11. **分享**：分享 URL 的 `/post/<id>` 路径用裸 `post.id`（构建期 `validateId` 已校验 URL 安全，与 SSG/sitemap/canonical 口径一致；encodeURIComponent 反而会与产物路径不一致）。

## 常见陷阱

- 头像（`q1.qlogo.cn`）不可达时在 `onError` 里切到 ui-avatars 兜底：只能在事件回调中改状态，不得在渲染期探测。
- 说说的 `content` 是 Markdown，摘要必须经 `stripMarkdown` 后再截断（`truncate`），否则会漏出 `**`、`` ` `` 等标记。
- 首页只渲染前 N 条数据，测试夹具要覆盖「被截断的那条不出现」，否则截断逻辑失效不会被发现。
- 页脚与备案由 `Layout` 统一渲染，首页不得重复输出。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
