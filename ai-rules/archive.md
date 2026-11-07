# 归档页（Archive）— AI 修改规则

## 功能概述

按「年份 → 月份」钻取式时间线展示全部文章：年份/月份折叠、搜索过滤、`?year=` / `?q=` URL 参数联动、结构化数据（CollectionPage + ItemList）。视觉走编辑式：衬线标题 + 右侧统计、年份大数字 + 发丝线、月份轻标签、文章行细线分隔，全部展开/折叠是 ghost 操作。

## 关键文件

- `src/pages/Archive.tsx`
- `src/pages/archive/archiveState.ts`（分组构建、展开状态、year 归一化）

## 修改规则（必须遵守）

1. **year 参数格式**：URL 写**纯数字**（`?year=2026`），展示层保留本地化文案（`2026年`）；所有比较必须经 `normalizeYearKey` 归一化（getInitialExpansion / ensureYearExpanded / URL 校验 / toggleYear 写入四处置为一致）。禁止把「2026年」写入 URL。
2. **展开状态**：默认展开最新年份首月；`?year=` 直访展开对应年份；非法 year 参数必须从 URL 移除并回退最新年份；搜索后自动展开全部（仅一次，用户手动折叠不被反弹）。
3. **URL ↔ 状态同步**：击键期间 URL 尚未提交时不得按 URL 回写输入框（`lastEditedQueryRef` 守卫，URL 追平编辑值后清空该 ref）；清除搜索同时移除 q 与 year。
4. **SSG 确定性**：首帧由 `getInitialPosts()` 分组渲染，不得依赖客户端时间。
5. **无效日期**：`buildArchiveGroups` 对非法日期承诺不抛错（月份回退 1、未知年份排最后），不得移除该容错。
6. **动画**：年份/月份展开折叠动画尊重 reducedMotion。
7. **编辑式页头**：`header` 为「标题 + 右侧统计 + 底边发丝线」——`h1` 用 `font-serif text-3xl font-bold md:text-4xl`、文案「归档」，右侧 `共 N 篇文章 · M 年` 用 `text-content-muted tabular-nums`。**不得**恢复 `Archive` 全大写英文眉题或重边框页头。
8. **时间线视觉**：年份按钮 = 大数字（`text-4xl md:text-5xl font-bold tabular-nums`）+ 小号「年」后缀 + 右侧篇数/chevron，底边 `border-line` 发丝线；月份按钮 = 小号 `text-xs font-semibold tracking-[0.14em]` + 篇数；文章行用 `divide-y divide-line`（外层 `border-t border-line`），桌面三列「日期 / 标题 / 分类·时长·评论」，日期 `font-mono text-[11px] tabular-nums`。全部展开/折叠是 ghost 按钮（`min-h-11`、hover `surface-muted`、`aria-pressed` 表示「全部已展开」），**不得**改回实底/描边按钮；加载骨架与时间线同构（发丝线分隔的轻量行），不得用重卡片骨架。

## 常见陷阱

- 空数据 mock 会让年份相关行为零覆盖（测试必须用非空固定数据集）；
- 钻取式交互：文章标题需要「年份 + 月份」两级都展开才可见。
- 「全部展开/折叠」的 `aria-pressed` 是合法的（它仍在同一时间线视图内切换全部展开态）；但不要把这个模式套到已退役的标签云——标签筛选现在在文章列表的 `TagsPanel` 内，见 [文章页](posts.md)。
- 恢复 `Archive` 大写眉题或给年份/文章行加回卡片边框/底色：与编辑式时间线定稿相反，`Archive.test` 的页头/文章行语义断言会红。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
