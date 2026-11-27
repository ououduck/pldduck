# 留言板（Guestbook）— AI 修改规则

## 功能概述

留言板 `/guestbook` 是访客留言列表，**一份留言 = 一条 GitHub Discussion**（2026-11 改造，与说说同一机制）：

- 列表：`/guestbook` 展示全部留言（构建期抓取，SSG 首帧直出），每条链到 `/guestbook/<number>`。
- 详情：`/guestbook/<number>` 用 giscus `mapping="number"` 锁定那一条，评论区只属于该份留言。
- 发布：点页头「写一条留言」到 GitHub「留言板」分类下新建 Discussion（新建后触发一次部署）。
- 数据源：`config/comments.config.json` 的 `guestbook.categoryName` / `categoryId`。

### 为什么必须是「一份留言一帖」

GitHub 的邮件通知是 **Discussion 级**：在某个 discussion 里留过言就会被自动 watch，之后该 discussion 下每条评论都发邮件，**没有** per-reply 订阅可配（giscus 也没有）。旧结构下（`discussionId: 2` 一条大 discussion 装全部留言），任何留过言的访客都会收到之后每一条**无关**留言的回复通知 —— 这正是 2026-11 用户反馈的 bug。一份一帖之后，访客只会收到自己参与过的那份留言的通知。

## 关键文件

- `src/pages/Guestbook.tsx`（列表）、`src/pages/GuestbookDetail.tsx`（详情 + giscus）
- `src/components/DiscussionCard.tsx` / `DiscussionMarkdown.tsx`（与说说共用）
- `scripts/fetch-discussions.mjs` / `src/services/discussions.ts` / `src/utils/discussion-core.mjs`
- `config/comments.config.json`（`guestbook` 段）；`.pages.yml` 的 `commentsConfig.guestbook`
- `config/routes.mjs`：`/guestbook`（`ssg: 'static'`）、`/guestbook/:number`（`ssg: 'discussions'`）

## 修改规则（必须遵守）

1. **一份留言一条 Discussion**：不得合并回单条大 discussion，也不得改回「在评论区留言」的形态（会把通知 bug 带回来）。
2. **详情页 `mapping="number"` 不可回退**：`specific` 会按标题模糊搜索并自动建讨论，`pathname` 会按路径另建线程；两者都会让「一份留言一个线程」失效。
3. **列表不内嵌 giscus**：评论区只在详情页（`Guestbook.test` 有负向断言）。
4. **配置校验**：`categoryName` / `categoryId` 缺任一时，留言板列表按「取不到数据」降级（不是「还没有留言」），并在构建日志 warn；不得静默注入无效 giscus。
5. **数据来源与降级口径与说说完全一致**：构建期 `fetch-discussions.mjs` 抓取 → `generated/discussions.json` → 前端 eager 内联。清单缺失时 `hasDiscussionList()` 为 false，页面显示错误态。
6. **旧合集讨论 #2 不进入列表**：`guestbook.discussionId` 是迁移前的合集讨论，抓取时按编号排除（它只作备份）。
7. **迁移痕迹必须剥离**：同说说规则 —— 渲染/摘要/标题都要先过 `stripMigrationArtifacts()`，原作者用 `readMigrationByline()` 展示。
8. **卡片式页头与列表**：页头 `rounded-overlay bg-surface p-6 md:p-8`（`h1` `font-sans text-4xl md:text-5xl`、文案「留言板」、通知口径说明、`写一条留言` 入口）；列表条目用 `DiscussionCard`。**不得**恢复跨页 `border-b` 发丝线或英文眉题。
9. **回退链**：giscus 来源（官方/自托管/同源代理）与超时重试逻辑在 `GiscusComments` 内，留言板不重复实现。
10. **SEO**：详情页输出 `DiscussionForumPosting` JSON-LD；`meta description` 走 `buildDiscussionMetaDescription()`（短内容补齐到 50–160）。

## 常见陷阱

- 修改 `comments.config.json` 的 `categoryName` / `categoryId` 必须与 GitHub 实际分类一致（分类只能在 GitHub 网页端 Discussions 里创建，REST/GraphQL 都没有建分类接口）。
- `giscus.json` 的 `origins` 只允许线上域名：本地 `http://localhost:*` 预览时 giscus 不加载、评论区留空是**预期行为**，不是 bug。
- 迁移标记 `<!-- pldduck-migrated:... -->` 漏剥离会在页面上显示成字面量；改渲染路径时跑 `src/utils/discussion-core.test.ts`。
- 新留言要等 `discussion-publish.yml` → `deploy.yml` 跑完才会出现在列表（在 GitHub 网页端建的会自动触发）。
- 历史留言已完整迁移并保留原合集讨论（#2）作备份，不要删除它 —— 迁移只新建不改不删。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
