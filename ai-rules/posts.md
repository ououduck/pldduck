# 文章页（Posts，`/posts`）— AI 修改规则

## 功能概述

文章列表页，承载全部与文章相关的浏览能力：横幅文章列表、右侧标签卡片（桌面）/ 右侧标签按钮 + 侧板弹窗（移动）、分类文字 tab、客户端搜索框（`?q=`）、标签筛选（`?tag=`）、继续阅读卡片、单排序切换按钮、分页、分享。页面没有英雄区：站点身份与页名由全站外壳（侧边栏 + 顶栏面包屑）承担，本页只有一个 `<h1 className="sr-only">文章</h1>` 供屏幕阅读器与搜索引擎定位主题。

布局：左侧内容列（筛选/搜索/横幅列表/分页）+ 右侧 `TagsPanel`（`lg` 起 sticky 标签卡）；移动端标签卡收成贴右侧中部的「标签」按钮，点击打开侧板弹窗。列表条目是横向横幅（`PostCard variant="banner"`，`<sm` 封面在上、`sm+` 图左文右），不是旧的竖排卡片网格。

**独立标签页 `/tags` 已退役**：旧 `/tags` 与 `/tags/*` 由 `public/_redirects` 301 到 `/posts`，`src/App.tsx` 的 `TagsRedirect` 做客户端兜底并把 `?tag=` 转交 `/posts?tag=`。标签云/标签页规则已并入本文件；**不得恢复独立标签页**。侧栏的「标签」「站内搜索」导航项也已删除（搜索入口在顶栏/命令面板，标签筛选在 `/posts`）。

URL 约定：列表 `/posts`（可带 `?category=` / `?tag=` / `?q=` / `?sort=` / `?page=`），正文详情 `/post/<id>`（18 个既有文章 ID 逐字节不变）。`/posts/<id>` 是常见的复数误写，由 `public/_redirects` 做真 301、`src/App.tsx` 的 `PostRedirect` 做客户端兜底，两者必须同时存在。

## 关键文件

- `src/pages/Posts.tsx`
- `src/components/PostCard.tsx`（`variant="banner"` 横向横幅：封面 + 文字，`bg-surface-muted` 大色块、`rounded-overlay`，`<sm` 封面在上/`sm+` 图左文右；`variant="card"` 竖排变体保留；React.memo）
- `src/components/TagsPanel.tsx`（桌面右侧 sticky 标签卡 + 移动端右侧入口/侧板弹窗；`TagList` 提供「全部文章 + 标签」筛选）
- `config/routes.mjs` 的 `/posts`、`/posts/:id` 与 `/tags` 重定向条目（见 `routes-single-source.md`）
- `src/hooks/usePostSearch.ts`（搜索 hook：防抖 + requestId 竞态 + 空查询兜底）
- `src/utils/postSelection.ts` / `postSorting.ts` / `homeQuery.ts`（精选/排序/URL 查询状态）
- `src/hooks/useScrollEdgeFade.ts` + `.filter-scroll-mask*`（分类栏两侧渐隐）
- `public/_redirects`（`/posts/:splat → /post/:splat`、`/tags → /posts` 301）

## 修改规则（必须遵守）

1. **水合一致性**：首帧用 `getInitialPosts()` 同步渲染（无 q 默认界面）；`?q=` 直访时首帧保持空查询渲染，水合后在 effect 中同步（既有模式，不得改为 useState 初值）。
2. **URL ↔ 状态单向同步**：`lastEditedQueryRef` 守卫只挡「击键后 URL 未提交」窗口期；URL 追平编辑值后必须清空 ref（否则后退/前进失同步）。任何对同步 effect 的修改都要保持此语义。
3. **搜索竞态**：空查询分支、防抖清理、requestId 比对不得移除；`emptyResults` 必须传稳定引用（否则渲染循环）。
4. **分类/排序/分页/标签**：状态必须与 URL 参数（category / tag / sort / page）双向一致；页码越界要自愈（钳制后 replace URL）；非法 tag 必须从 URL 清理并回退「全部文章」，不得留下指向不存在标签的筛选态。
5. **精选置顶**：`isPinnedFeaturedPost` / `getHeroPost` 等选择逻辑在 utils 中，不得在组件内复制实现。
6. **动画**：framer-motion 只做分类栏滚动渐隐与标签侧板弹窗开合，不做列表入场动画；尊重 `prefers-reduced-motion`（`shouldReduceMotion` 传透）；SSR 输出不得为 opacity:0 的内容。
7. **性能**：PostCard 保持 memo；标签筛选的 `buildTagList` 走 useMemo；不要引入整页重渲染的依赖。
8. **分享**：分享 URL 的 `/post/<id>` 路径用裸 `post.id`（构建期 `validateId` 已校验 URL 安全，与 SSG/sitemap/canonical 口径一致；encodeURIComponent 反而会与产物路径不一致）。
9. **SEO 标题**：`<Seo title=…>` 只写**前缀**（`文章` / `分类：X` / `标签：X` / `搜索：X`），站点名后缀由 `Seo.tsx` 按「页面名 | 站点名」拼接；自己再拼一次会得到「X | 站点名 | 站点名」。默认标题**不得**用 `siteConfig.title`：那会命中 `Seo.tsx` 的首页覆盖分支，让 `/posts` 与 `/` 输出同一个 title，形成软重复。
10. **路由新增**：`/posts` 是 SSG 静态页（`ssg: 'static'`，产物 `dist/posts/index.html`）；`/posts/:id` 只做跳转，不得给它加 `ssg`/`sitemap`，否则会把误写 URL 预渲染成可索引页面；`/tags` 只保留重定向条目（`sw: true`，无 `ssg`/`sitemap`/`preload`），不得把独立标签页加回来。
11. **横幅列表视觉**：条目是 `PostCard variant="banner"`——`bg-surface-muted` 大色块 + `rounded-overlay`，`<sm` 封面上（16/9 全宽）、信息在下，`sm+` 图左文右（封面 34% 宽、`min-h-52`）；标题用 `font-serif`（精选更大），元信息/标签低对比。**不得**恢复旧的竖排卡片网格、整块边框/白底/阴影或分类胶囊；标签链接一律 `/posts?tag=<encoded>`（不再是 `/tags?tag=`）。
12. **标签卡与移动标签弹窗**：桌面右侧 `TagsPanel` 是 `lg:sticky` 的 `w-64` surface-muted 卡片（标题「标签」+ 标签数 + 可滚动列表，`max-h-[calc(100vh-7rem)]`）；移动端是贴右侧中部的「标签」按钮（`aria-expanded`/`aria-controls`，点击打开 `role="dialog"` 侧板，`useModalOverlay` 负责滚动锁、Escape 关闭与焦点陷阱，选完标签后关闭）。标签项是同一页面内的筛选 toggle，`aria-pressed` 合法且应保留；激活项 `bg-content text-background`，计数用 `tabular-nums`。**不得**把弹窗改成 navigate 到独立标签页，也不得去掉 Escape/焦点管理。
13. **PostCard 双 variant 与搜索一致性**：`variant="banner"` 同时用于 `/posts` 列表与 `/search` 结果（Search 也是单列横幅，移动端封面在上）；`variant="card"` 竖排变体保留（测试/未来场景），但生产搜索结果**不得**再切回 `CompactPostCard` 或三列网格。两 variant 必须保持相同信息层级（分类/标题/摘要/日期/阅读时长/分享），`card` 仍要 `h-full` 且由父容器控制列宽；**不得**把 `PostCard` 改成只支持 banner。
14. **筛选栏、继续阅读与骨架**：分类仍是文字 tab（底部细线），排序收成一个切换按钮（`aria-pressed`）；继续阅读是 `rounded-overlay bg-surface-muted p-4 md:p-5` 的卡片（顶部小标题/进度 + 继续/放弃操作 + 细进度线），**不得**退回无底色的细横条；横幅列表骨架与 banner 同构（封面块 + 文字条）；加载/搜索中不得整块闪回骨架（旧结果保留）。

## 常见陷阱

- 修改 `usePostSearch` 的返回结构会同时影响 Search/Archive/Posts（Tags 页已退役，但标签筛选仍在 Posts）。
- 骨架屏/加载态切换不应在每次击键时卸载整个文章网格（旧结果应保留）。
- SEO title：有查询时输出「搜索：X」，有标签时输出「标签：X」，无结果也应保持搜索/标签语义而非回退站点默认标题。
- 分类栏两侧渐隐由 `useScrollEdgeFade` + `.filter-scroll-mask*`（`src/index.css`）配对实现，删掉 hook 只会留下恒为 0 的渐隐宽度。
- 恢复 `/tags` 独立页、侧栏「标签」入口或把标签链接写回 `/tags?tag=`：独立标签页已并入文章列表，旧链接必须继续走 301/客户端兜底；恢复会让两套标签筛选逻辑并存。
- 给标签卡补 `aria-pressed` 的顾虑：它不是旧的「标签云导航视图切换」，而是同一页面内的筛选 toggle，**应保留** `aria-pressed`；但选项文本不要再叫「返回全部标签」之外的页面级导航。
- 改 `PostCard` 布局时只测 `/posts` 不测 `/search`：`/search` 也复用 `variant="banner"` 单列横幅，移动堆叠与 `line-clamp` 的行为两边都要看。
- 把继续阅读改回无底色的细横条，或让 PostCard banner 在移动端保持「图左文右」：移动端必须封面在上、信息在下，继续阅读必须是 surface-muted 卡片（`Posts.test` 会红）。
- 把横幅卡片改回竖排卡片网格，或给条目加回 `border bg-white shadow`：与定稿的轻量大色块横幅相反，`Posts.test` 的横幅结构断言会红。
- 把搜索改回两套卡片（桌面三列 + 移动 Compact）：搜索已统一 `PostCard variant="banner"` 单列横幅，恢复双套会让响应式断点再次分叉；`Search.test` 有断言。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
