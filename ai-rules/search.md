# 搜索（Search）— AI 修改规则

## 功能概述

全站搜索页：独立搜索页（`?q=` 参数，首页已无搜索入口）、搜索范围文字 tab（全部/分类/正文内容/仅标题）、结果相关度排序、分享。视觉走编辑式：衬线标题 + 右侧结果统计、范围 tab 用底部细线、轻量骨架、输入框旁静态提示 Ctrl/⌘+K。顶栏搜索按钮与 Ctrl/Cmd+K 现打开命令面板（CommandPalette 复用本页搜索评分体系），侧边栏与移动抽屉的「站内搜索」项直接跳转到本页，面板内「打开搜索页」亦可进入。

## 关键文件

- `src/pages/Search.tsx`
- `src/hooks/usePostSearch.ts`
- `src/services/posts.ts`（searchPosts、getFieldMatchScore、搜索索引）

## 修改规则（必须遵守）

1. **URL ↔ 状态同步**：击键期间 URL 尚未提交时不得按 URL 回写输入框（`lastEditedQueryRef` 守卫，URL 追平编辑值后清空该 ref）；`?q=` 直访在水合后同步进搜索。
2. **搜索范围**：`scope` 状态与 URL 参数联动（切换范围不丢查询）；范围选项文案/语义在组件常量中，保持既有五档（全部/分类/正文内容/仅标题等）。
3. **相关度排序**：`getFieldMatchScore`（精确/前缀/包含加权）与日期降序在 `services/posts.ts` 中，不得在组件内重写。
4. **竞态与防抖**：usePostSearch 的防抖清理、requestId 比对不得移除。
5. **SSG 确定性**：SSG 只预渲染无 q 默认界面；带 q 的结果在客户端执行。
6. **分享 URL**：`/post/<id>` 路径用裸 `post.id`（与 SSG/canonical 口径一致）；查询参数（`?q=` 等）才需 `encodeURIComponent`。
7. **编辑式页头与范围 tab**：`header` 为「衬线标题 + 右侧统计 + 底边发丝线」——`h1` 用 `font-serif text-3xl font-bold md:text-4xl`、文案「搜索」，右侧显示结果数/「全站文章检索」；**不得**恢复 `Search` 全大写英文眉题。搜索范围是文字 tab（容器 `role="group" aria-label="搜索范围"`，激活项 `border-b-2 border-content text-content`，非激活 `border-transparent text-content-muted`），`aria-pressed` 保留（同一搜索界面内的范围切换），**不得**改成下拉/胶囊按钮组；`?scope=` 写入、非法值回退 `all`、切换范围不丢 `q` 的既有行为不变。
8. **轻量骨架与快捷键提示**：搜索中且无结果时，骨架是 `bg-surface-muted` 的轻块（移动 `h-16 rounded-micro`、桌面 `h-44 rounded-surface`，`motion-reduce:animate-none`），**不得**恢复带边框/白底的重卡片骨架；输入框右侧的 `Ctrl / ⌘ + K 打开命令面板` 只是静态 `kbd` 提示（`hidden sm:flex`），**不得**为它新增快捷键监听——命令面板统一由 `Layout` 处理。

## 常见陷阱

- 搜索索引在 services 层构建（懒加载），修改 `searchPosts` 签名会同时影响 Archive/Tags/Search 页面与命令面板（Home 已无搜索，不再消费该接口）；SearchModal 已移除，搜索入口统一跳转 `/search` 独立页，不再有弹窗形态的调用方；
- 无结果页的 SEO title 应保持「搜索：X」语义。
- 把范围 tab 改回胶囊/下拉，或移除 `aria-pressed`：范围切换仍在同一搜索界面内，`aria-pressed` 是正确的；视觉只用底部细线表达激活，不要加实底块。
- 给静态快捷键提示加独立 keydown 监听：Ctrl/⌘+K 已由 Layout 的命令面板统一处理，重复监听会在弹层打开时二次触发。
- 恢复 `Search` 大写眉题或带边框骨架：`Search.test` 的页头与轻骨架断言会红。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
