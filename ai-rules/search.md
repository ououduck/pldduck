# 搜索（Search）— AI 修改规则

## 功能概述

全站唯一的搜索结果页 `/search`（`?q=` 参数驱动，带 `q` 时 `noindex`）。首页与顶栏/命令面板只提供入口，结果与评分一律在这里呈现。

- 搜索范围三档（全部 / 正文内容 / 仅标题），与 `?scope=` 双向联动；
- 结果按相关度 + 日期排序，统一用 `PostCard variant="banner"` 单列横幅（桌面图左文右，移动端封面在上）；
- 首条结果参与「一镜到底」封面转场（见 `ai-rules/layout-nav.md`）。

## 关键文件

- `src/pages/Search.tsx`
- `src/components/PostCard.tsx`（结果统一 `variant="banner"`）
- `src/hooks/usePostSearch.ts`
- `src/hooks/useSharedElementTransition.ts`（共享元素转场开关）
- `src/services/posts.ts`（`searchPosts`、`getFieldMatchScore`、搜索索引）

## 修改规则（必须遵守）

1. **URL ↔ 状态同步**：击键期间 URL 尚未提交时不得按 URL 回写输入框（`lastEditedQueryRef` 守卫，URL 追平编辑值后清空该 ref）；`?q=` 直访在水合后同步进搜索。
2. **搜索范围**：`scope` 状态与 URL 参数联动（切换范围不丢查询）；保持既有三档（全部/正文内容/仅标题）。**没有 category 档**：文章 category 已删除，搜索只按标题/摘要/正文/标签检索。
3. **相关度排序**：`getFieldMatchScore`（精确/前缀/包含加权）与日期降序在 `services/posts.ts` 中，不得在组件内重写。
4. **竞态与防抖**：`usePostSearch` 的防抖清理、requestId 比对不得移除。
5. **SSG 确定性**：SSG 只预渲染无 `q` 的默认界面；带 `q` 的结果在客户端执行。
6. **分享 URL**：`/post/<id>` 路径用裸 `post.id`（与 SSG/canonical 口径一致）；查询参数才需 `encodeURIComponent`。
7. **卡片式布局（2026-11 定稿）**：整页与站内栏目页统一为卡片结构，**不得**恢复发丝线页头：
   - 页面根容器 `mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10`；
   - 页头卡片 `rounded-overlay bg-surface p-6 md:p-8`，`h1` 用 `font-sans text-4xl font-bold md:text-5xl`，文案「搜索」；介绍句用 `text-content-muted`，结果数/「全站文章检索」用 `text-content-tertiary`；
   - 搜索卡片 `rounded-overlay bg-surface p-5 md:p-6`：内置 `SearchField`（`size="large"`、`containerClassName="w-full"`）、范围切换与 `Ctrl / ⌘ + K` 静态提示；
   - 结果区每张 `PostCard` 自身即卡片，容器用 `flex flex-col gap-3`；
   - 空态/错误态用 `ContentStatus` 并带 `rounded-overlay border-0 bg-surface`，与卡片语言一致。
8. **范围切换控件**：容器 `role="group" aria-label="搜索范围"`，激活项 `bg-surface-muted text-content`、非激活 `text-content-muted hover:bg-surface-muted`，`aria-pressed` 必须保留（同一界面内的范围切换）；**不得**改回底部发丝线 tab、下拉或胶囊按钮组。`?scope=` 写入、非法值回退 `all`、切换范围不丢 `q` 的行为不变。
9. **骨架与快捷键提示**：搜索中且无结果时，骨架必须与最终横幅同构（`rounded-overlay bg-surface-muted`、`sm:grid sm:grid-cols-[minmax(0,34%)_minmax(0,1fr)]`、`motion-reduce:animate-none`）；输入框右侧的 `Ctrl / ⌘ + K` 只是静态 `kbd` 提示（`hidden sm:flex`），**不得**为它新增快捷键监听——命令面板统一由 `Layout` 处理。
10. **结果横幅统一**：结果固定为 `PostCard variant="banner"` 单列；**不得**恢复 `CompactPostCard`、桌面三列网格或两套响应式卡片并存。
11. **共享元素转场（可选增强）**：只给**第一条**结果传 `shareCoverTransition`（`sharedElementTransition && index === 0`）。同一视图内 `view-transition-name` 必须唯一，给多条结果同时开启会让转场静默失效。

## 常见陷阱

- 搜索索引在 services 层构建（懒加载），修改 `searchPosts` 签名会同时影响 Search/Archive/Posts 页面与命令面板；搜索入口统一跳转 `/search`，不再有弹窗形态的调用方。
- 首页与顶栏/命令面板都只是入口：结果与评分只在 `/search`，不要把结果卡塞回首页或导航。侧栏「站内搜索」导航项已删除，不要再加回。
- 无结果页的 SEO title 应保持「搜索：X」语义。
- 把范围切换改回发丝线 tab / 下拉，或移除 `aria-pressed`：范围切换仍在同一搜索界面内。
- 给静态快捷键提示加独立 keydown 监听：Ctrl/⌘+K 已由 Layout 的命令面板统一处理，重复监听会在弹层打开时二次触发。
- 恢复发丝线页头或带边框骨架：`Search.test` 的页头与卡片断言会红。
- 恢复 `CompactPostCard` / 桌面三列网格：搜索已统一为单列横幅，`Search.test` 断言结果全部是 `PostCard variant="banner"`。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
