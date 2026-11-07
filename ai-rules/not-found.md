# 404 页（NotFound）— AI 修改规则

## 功能概述

未匹配路由的 404 页：跑路文案 + 站内搜索框（回车 → /search?q=）+ 归档/标签/搜索页入口 + 最近文章推荐（构建期元数据）+ 当前路径调试信息，noindex。

## 关键文件

- `src/pages/NotFound.tsx`
- `src/components/NotFoundState.tsx`（与文章缺失页共用状态块；说说详情页退役后不再复用于说说）

## 修改规则（必须遵守）

1. **不嵌套 `<main>`**：Layout 已渲染 `<main>` 包裹路由内容，本页只能渲染 `<div>`（HTML 规范禁止 main 嵌套 main）。
2. **noindex**：404 页必须 `Seo noindex`（SPA 内 200 响应，避免被收录）。
3. **debugLabel**：仅在开发/缺失场景展示调试信息；文章缺失页复用 NotFoundState 时保持一致文案模式。
4. **调试路径水合一致性**：debugLabel 的路径**不得在渲染期直接读 location.pathname** —— SSG 用占位路由 /**missing** 预渲染、构建后替换为 /，客户端在真实未知路径水合时首帧直读会与 SSR 文本不一致。必须首帧输出占位符、挂载后 effect 写入真实路径。
5. **编辑式视觉**：删除 `Page Missing` 英文眉题；`NotFoundState` 的标题用 `font-serif text-3xl md:text-4xl`，右上角「404」是 `aria-hidden` 的极轻水印（`md:` 起显示、绝对定位不占布局、低对比字色），返回按钮为 ghost 描边（`border-line`、`min-h-11`）。404 页的搜索是发丝线下划线输入 + 文字按钮，快速入口是文字链接 + `border-t border-line`，最近文章是 `border-t` / `border-b border-line` 的细线列表。**不得**恢复英文眉题、大色块 404 或重卡片。`NotFoundState` 与文章缺失页共用，改视觉不能破坏 `title/description/backTo/backLabel/debugLabel/children` 契约。

## 常见陷阱

- NotFoundState 的修改会同时影响 404 页与文章缺失页；
- 调试信息（路径/id）不得泄露敏感内容（当前仅 pathname/id，保持此范围）。
- 恢复 `Page Missing` 英文眉题、大色块 404 或重卡片返回按钮：`NotFound.test` / `NotFoundState.test` 的编辑式页头与 ghost 返回断言会红。
- 404 页搜索内嵌结果或改成命令面板：这里只做「输入关键词 → 跳 /search?q=」，搜索评分/结果都在搜索页。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
