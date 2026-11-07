# 标签页（Tags）— AI 修改规则

## 功能概述

标签云 + 标签筛选：搜索文章/标签、`?tag=` / `?q=` URL 参数联动、选中标签的文章列表、标签大小按文章数分级。视觉走编辑式：衬线标题 + 右侧统计，标签云只用字号/字重/颜色分级（无胶囊/重下划线），选中标签后的文章列表为单列发丝线条目。

## 关键文件

- `src/pages/Tags.tsx`（`buildTagList` 标签聚合、标签云与筛选）
- `src/utils/postRelations.ts`（文章关联，供文章详情页使用；标签页不消费）

## 修改规则（必须遵守）

1. **URL ↔ 状态同步**：击键期间 URL 尚未提交时不得按 URL 回写输入框（`lastEditedQueryRef` 守卫，URL 追平编辑值后清空该 ref）；`?tag=` 直访要筛选对应标签，非法 tag 回退。
2. **派生状态记忆化**：`tags`/`allTags`/`selectedTagInfo`/`maxCount` 必须走 useMemo 链（每次渲染对全量 posts 重算 buildTagList 是明确禁止的性能回退）。
3. **标签大小分级**：`getTagSize` 按 count/maxCount 比例分三档，输出的是**字号/字重/文字色**组合（`text-lg font-semibold text-content` / `text-base font-medium text-content` / `text-sm font-normal text-content-muted`，sm 以上再升一档）；不得改回胶囊底色、边框或粗下划线。
4. **SSG 确定性**：标签云首帧由构建期内联数据渲染，不得依赖客户端时间/随机。
5. **无障碍与语义（重要）**：标签云是**导航视图切换**——点击某个标签后标签云整体替换为「选中标签的文章视图」，再通过「返回全部标签」回到云视图；它不是留在同一界面上的开关/筛选器，因此**不得**给标签按钮加 `aria-pressed`（旧规则要求 `aria-pressed` 已作废，`aria-pressed` 只适用于归档「全部展开/折叠」、搜索范围 tab 这类同一视图内的 toggle）。每项保留含文章数的 `aria-label`（`查看标签 X，共 N 篇文章`）与 `min-h-11` 44px 点击区；「返回全部标签」是文字 ghost 按钮，必须显式 `type="button"`。
6. **编辑式页头**：`header` 为「标题 + 右侧统计 + 底边发丝线」——`h1` 用 `font-serif text-3xl font-bold md:text-4xl`、文案「标签集合」，右侧 `共 N 个标签 · M 篇文章`。**不得**恢复 `Tags Collection` 全大写英文眉题。
7. **标签云轻量分级**：只靠字号/字重/颜色与留白（`gap-x` / `gap-y`）分层，数量用 `text-[11px] font-normal tabular-nums text-content-muted` 跟在标签名后；**不得**使用胶囊底色/边框/粗下划线或 `border-y` 重卡片容器。
8. **选中标签文章列表**：单列发丝线条目（外层 `border-t border-line`、每项 `border-b border-line`），标题 `h3`、摘要 `line-clamp-2`、日期/阅读时长在桌面右对齐；**不得**恢复分类胶囊或重卡片。选中视图保留「标签 / 选中名 / 共 N 篇」小标题与「返回全部标签」文字 ghost；结果区保留 `aria-live="polite"`。

## 常见陷阱

- 修改 `Tags.tsx` 的 `buildTagList` 会影响标签页的标签云与文章数分级（首页已不再派生标签，不要再把它接回首页）；
- 搜索结果与全量标签两个数据源（results vs allPosts）不要混淆。
- 给标签云按钮补 `aria-pressed`：选中后云视图整体被替换，`aria-pressed` 会把「视图导航」误报成「开关状态」，读屏用户听到的按下态与实际界面不符；要表达当前选中，用选中视图的标题/「返回全部标签」即可。
- 把标签云改回胶囊/边框/粗下划线，或给选中标签文章列表加分类胶囊/重卡片：与定稿的编辑式风格相反，`Tags.test` 的分级与轻量条目断言会红。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
