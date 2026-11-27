# 评论系统（Giscus）— AI 修改规则

## 功能概述

Giscus 评论区（文章评论 + 说说详情 + 留言详情）：懒加载、多来源回退链（同源代理 → 官方）、超时重试、深色主题（全站固定 dark）、评论数构建期快照。加载动画直接渲染，不套内层边框/底色块；离线/错误提示可用弱底色块，但不再用上下 `border-y` 发丝线围绕加载动画。三个区域的评论都走同一套 GitHub Discussions 审核链路。

**2026-11 结构变更**：说说与留言板不再是「一个大 Discussion 装全部内容」，而是**一条内容一条 Discussion**（每条有自己的 `/shuoshuo/<number>`、`/guestbook/<number>` 详情页）。原因是 GitHub 的邮件通知是 Discussion 级的，且没有 per-reply 订阅 —— 合集形态会让任何留过言的人收到全部无关回复。文章评论不受影响（本来就是每篇文章一条 discussion）。

## 关键文件

- `src/components/GiscusComments.tsx`
- `src/pages/ShuoShuoDetail.tsx` / `src/pages/GuestbookDetail.tsx`（mapping=number，逐条锁定）
- `scripts/fetch-giscus-comments.mjs`（构建期评论数快照）
- `scripts/lib/comment-surface.mjs`（区域识别：**按分类名**，见规则 8）
- `config/comments.config.json`（giscusEnabled / comments 段 / 两个区域的分类）

## 修改规则（必须遵守）

1. **回退链**：来源解析（resolveGiscusOrigins）保持「配置 origin → 官方兜底」有序回退；8s 单源超时 + 自动重试的既有机制不得移除。
2. **非法配置容错**：origin 配置非法（非 URL）时必须在来源解析阶段过滤并告警，禁止在 message 处理器中抛 TypeError 中断监听。
3. **成功判定兜底**：isLoaded 依赖 giscus postMessage；改动时需考虑 iframe load 兜底信号（防止占位常驻）。
4. **深色主题固定**：全站 `<html class="dark">`，giscus 初始 `theme=dark`；iframe 就绪前丢弃的 postMessage 补发机制保留（仅用于初始化握手/后续主题消息），不再有浅色主题切换分支。
5. **mapping 语义**：pathname（文章按路径自动建讨论）/ number（说说与留言逐条精确锁定）语义不可混淆；缺 term 时禁止静默注入。**说说与留言的详情页必须 `mapping="number"` + 该条编号** —— `specific` 会按标题模糊搜索并自动建讨论，`pathname` 会按路径另建线程，两者都会破坏「一条内容一个线程」并让通知 bug 复发。
6. **构建期评论数**：fetch-giscus-comments 用 fetchWithRetry（防抖动），失败优雅降级（不阻塞构建）。排除说说/留言评论时**按分类名**判定（不再只看单个固定编号），否则一条一帖的评论数会被算进文章卡片。
7. **BASE_PATH 匹配口径**：discussion 标题（页面 URL pathname）与文章路由匹配必须叠加 BASE_PATH（withBasePath）—— 子路径部署时硬编码 `/post/<id>` 匹配不上，评论数会静默全缺。
8. **三个区域审核一致**：文章评论、留言详情、说说详情的评论都通过 `discussion_comment` 事件进入 Akismet / 关键词过滤 / 全量复查；`scripts/lib/comment-surface.mjs` **按分类名**（`comments.config.json` 的 `shuoshuo.categoryName` / `guestbook.categoryName`）识别区域并写入日志/飞书通知 —— 一条一帖后编号不再固定，**不得**改回只按单个 discussionId 判定（旧固定编号只作迁移兜底保留在第二档）。**不得**按分类或 `giscus[bot]` 把说说评论整体排除；机器人豁免只针对机器人账号自身。

## 常见陷阱

- 大陆网络下 giscus.app 可能被 DNS 污染：回退链与超时是核心体验保障；
- 评论数快照写入 post 数据（commentCount），改动生成逻辑需同步 SSG 数据流；
- **文章 ID 是对外契约**：文章评论按 `mapping=pathname` 用 `/post/<id>` 匹配线程，改 ID 等于换一条评论区，旧站收录的链接也会一起失效；
- **换仓库/换站点**时 `comments.repo` / `comments.repoId` / `comments.categoryId` / `guestbook.categoryId` / `shuoshuo.categoryId` 要一起换；分类（「文章评论」「留言板」「说说」）**只能在 GitHub 网页端 Discussions 里创建**，REST 与 GraphQL 都没有开放的建分类接口，不要试图用脚本代劳。
- **在列表页挂评论区**：说说/留言的列表页一旦内嵌 `GiscusComments`，访客就等于订阅了整个列表 —— 那正是 2026-11 修复的 bug。评论区只能在 `/shuoshuo/<n>`、`/guestbook/<n>` 详情页。
- **本地预览看不到评论**：`giscus.json` 的 `origins` 只允许线上域名，`http://localhost:*` 下 giscus 不加载（评论区留空是预期行为），不要为此放宽 origins。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
