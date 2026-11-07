# 文章页（Posts，`/posts`）— AI 修改规则

## 功能概述

文章列表页，承载全部与文章相关的浏览能力：分类文字 tab（底部细线）、轻量文章条目（封面 + 文字，无重卡片边框/白底/阴影）、客户端搜索框（`?q=`）、继续阅读细横条、单排序切换按钮、分页、分享。页面**没有英雄区**：站点身份与页名由全站外壳（侧边栏 + 顶栏面包屑）承担，本页只有一个 `<h1 className="sr-only">文章</h1>` 供屏幕阅读器与搜索引擎定位主题。首页 `/` 是极简个人主页（不含搜索与内容列表），**不得**把这些能力搬回去。

URL 约定：列表 `/posts`，正文详情 `/post/<id>`（18 个既有文章 ID 逐字节不变）。`/posts/<id>` 是常见的复数误写，由 `public/_redirects` 做真 301、`src/App.tsx` 的 `PostRedirect` 做客户端兜底，两者必须同时存在。

## 关键文件

- `src/pages/Posts.tsx`
- `config/routes.mjs` 的 `/posts` 与 `/posts/:id` 条目（见 `routes-single-source.md`）
- `src/components/PostCard.tsx`（轻量条目：封面 + 文字；精选横排 + 普通竖排两形态；React.memo。**同时服务 Search 桌面三列网格**，不能改成只适用于纵向列表的布局）
- `src/hooks/usePostSearch.ts`（搜索 hook：防抖 + requestId 竞态 + 空查询兜底）
- `src/utils/postSelection.ts` / `postSorting.ts` / `homeQuery.ts`（精选/排序/URL 查询状态）
- `public/_redirects`（`/posts/:splat → /post/:splat 301`）

## 修改规则（必须遵守）

1. **水合一致性**：首帧用 `getInitialPosts()` 同步渲染（无 q 默认界面）；`?q=` 直访时首帧保持空查询渲染，水合后在 effect 中同步（既有模式，不得改为 useState 初值）。
2. **URL ↔ 状态单向同步**：`lastEditedQueryRef` 守卫只挡「击键后 URL 未提交」窗口期；URL 追平编辑值后必须清空 ref（否则后退/前进失同步）。任何对同步 effect 的修改都要保持此语义。
3. **搜索竞态**：空查询分支、防抖清理、requestId 比对不得移除；`emptyResults` 必须传稳定引用（否则渲染循环）。
4. **分类/排序/分页**：状态必须与 URL 参数（category/sort/page）双向一致；页码越界要自愈（钳制后 replace URL）。
5. **精选置顶**：`isPinnedFeaturedPost` / `getHeroPost` 等选择逻辑在 utils 中，不得在组件内复制实现。
6. **动画**：framer-motion 只做分类栏的滚动渐隐，不做入场动画；尊重 `prefers-reduced-motion`（`shouldReduceMotion` 传透）；SSR 输出不得为 opacity:0 的内容。
7. **性能**：PostCard 保持 memo；不要引入整页重渲染的依赖。
8. **分享**：分享 URL 的 `/post/<id>` 路径用裸 `post.id`（构建期 `validateId` 已校验 URL 安全，与 SSG/sitemap/canonical 口径一致；encodeURIComponent 反而会与产物路径不一致）。
9. **SEO 标题**：`<Seo title=…>` 只写**前缀**（`文章` / `分类：X` / `搜索：X`），站点名后缀由 `Seo.tsx` 按「页面名 | 站点名」拼接；自己再拼一次会得到「X | 站点名 | 站点名」。默认标题**不得**用 `siteConfig.title`：那会命中 `Seo.tsx` 的首页覆盖分支，让 `/posts` 与 `/` 输出同一个 title，形成软重复。
10. **路由新增**：`/posts` 是 SSG 静态页（`ssg: 'static'`，产物 `dist/posts/index.html`）；`/posts/:id` 只做跳转，不得给它加 `ssg`/`sitemap`，否则会把误写 URL 预渲染成可索引页面。
11. **列表视觉轻量化**（UI 重构第二阶段）：条目是「封面 + 文字」，**不得**恢复整块 `border` / 白底 / `shadow` 卡片；标签为低对比纯文字（最多 3 个，不得改回胶囊色块）；精选条目用横排（封面 + 文字两栏）；分类是文字 tab（选中态靠文字色 + 底部细线/下划线，不得改成胶囊按钮组）；排序收成**一个**切换按钮（图标 + 当前排序词，`aria-pressed` 跟随「最早优先」态），不得拆回下拉或多按钮；继续阅读是细横条（顶部细线 + 进度发丝线 + 继续/放弃操作）。骨架屏必须与轻量条目同构（封面块 + 文字条），不得回到重卡片骨架。
12. **PostCard 双场景一致性**：`PostCard` 同时用于 `/posts` 列表与 `/search` 桌面三列网格（`lg:grid-cols-3`）。普通卡片必须 `h-full` 且高度由内容决定，由父容器控制列宽/间距；**不得**把组件改成固定高度、横向列表或只在 `flex-col` 下成立的布局，否则搜索桌面网格会被压扁/错位。移动端搜索仍用 `CompactPostCard`，两边样式可不同但信息层级（分类/标题/摘要/元信息）保持一致。

## 常见陷阱

- 修改 `usePostSearch` 的返回结构会同时影响 Search/Archive/Tags；
- 骨架屏/加载态切换不应在每次击键时卸载整个文章网格（旧结果应保留）；
- SEO title：有查询时输出「搜索：X」，无结果也应保持搜索语义而非回退站点默认标题；
- 分类栏的两侧渐隐由 `useScrollEdgeFade` + `.filter-scroll-mask*`（`src/index.css`）配对实现，删掉 hook 只会留下恒为 0 的渐隐宽度，看不出问题。
- 视觉重构后别把「轻量」改回去：给 `PostCard` 加 `border bg-white shadow`、给标签加胶囊底色、把分类文字 tab 换成彩色 pill、把排序拆回下拉——这些都和第二阶段定稿的克制风格相反，也会让搜索网格与列表页外观漂移。
- 改 `PostCard` 布局时只测 `/posts` 不测 `/search`：桌面三列网格复用同一组件，列内宽度更窄、`h-full` 与 `line-clamp` 的行为最容易在这里坏掉。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
