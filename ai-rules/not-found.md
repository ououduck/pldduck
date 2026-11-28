# 404 页（NotFound）— AI 修改规则

## 功能概述

未匹配路由的 404 页，`noindex`。内容全部以**卡片**组织，与站内栏目页同一套视觉语言：

- 页头卡片：`404` 小标签 + 标题「这篇文章跑路了」+ 说明 + 返回首页按钮 + 当前路径调试信息；
- 搜索卡片：站内搜索输入（回车 → `/search?q=`）；
- 入口卡片：文章 / 归档 / 搜索三个方块入口；
- 最近文章卡片：构建期元数据里的最近 3 篇。

## 关键文件

- `src/pages/NotFound.tsx`
- `src/components/NotFoundState.tsx`（与文章缺失页共用状态块）

## 修改规则（必须遵守）

1. **不嵌套 `<main>`**：Layout 已渲染 `<main>` 包裹路由内容，本页只能渲染 `<div>`（HTML 规范禁止 main 嵌套 main）。
2. **noindex**：404 页必须 `Seo noindex`（SPA 内 200 响应，避免被收录）。
3. **debugLabel**：仅在开发/缺失场景展示调试信息；文章缺失页复用 `NotFoundState` 时保持一致文案模式。
4. **调试路径水合一致性**：debugLabel 的路径**不得在渲染期直接读 location.pathname** —— SSG 用占位路由 `__missing__` 预渲染、构建后替换为 `/`，客户端在真实未知路径水合时首帧直读会与 SSR 文本不一致。必须首帧输出占位符、挂载后 effect 写入真实路径。
5. **全站可见文案不使用 emoji**：标题固定为「这篇文章跑路了」，不带任何 emoji。
6. **卡片式视觉（2026-11 定稿）**：
   - `NotFoundState` 根容器是 `mx-auto max-w-3xl pt-6 md:pt-10`，页头是 `rounded-overlay bg-surface p-6 md:p-8`；
   - 页头内是 `404` 小标签（`text-xs uppercase tracking-[0.12em] text-content-tertiary`）+ `h1`（`font-sans text-3xl md:text-4xl`），**不再有**浮空的大号浅色「404」水印；
   - 返回按钮是 ghost 描边（`border-line`、`min-h-11`、hover `border-accent`）；
   - 搜索卡片、入口卡片、最近文章卡片各自是 `rounded-overlay bg-surface`；输入框用 `.editorial-input`，提交按钮用 `.editorial-button-primary`；
   - 最近文章是卡片内的逐条链接（`hover:bg-surface-muted`），**不再**用 `border-t` / `border-b border-line` 细线列表；
   - **不得**恢复英文眉题、发丝线分隔、浮空水印或重卡片网格。
7. **契约稳定**：`NotFoundState` 与文章缺失页共用，改视觉不能破坏 `title/description/backTo/backLabel/debugLabel/children` 这组 props。

## 常见陷阱

- `NotFoundState` 的修改会同时影响 404 页与文章缺失页；
- 调试信息（路径/id）不得泄露敏感内容（当前仅 pathname/id，保持此范围）；
- 恢复英文眉题、浮空水印或发丝线列表：`NotFound.test` / `NotFoundState.test` 的卡片与 ghost 返回断言会红；
- 404 页搜索内嵌结果或改成命令面板：这里只做「输入关键词 → 跳 `/search?q=`」，搜索评分/结果都在搜索页。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
