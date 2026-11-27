# 说说（ShuoShuo）— AI 修改规则

## 功能概述

说说页 `/shuoshuo` 是一个「朋友圈」式短动态流，**一条说说 = 一条 GitHub Discussion**（2026-11 改造）：

- 数据源：仓库 Discussions 的「说说」分类（`config/comments.config.json` 的 `shuoshuo.categoryName` / `categoryId`）。
- 列表：`/shuoshuo` 是列表页，条目来自**构建期抓取**的 `generated/discussions.json`（SSG 首帧直出，爬虫不执行 JS 也能读到）。
- 详情：`/shuoshuo/<number>` 用 giscus `mapping="number"` 精确锁定那一条，评论区只属于该条。
- 发布：在 GitHub「说说」分类下新建 Discussion；新建会触发 `discussion-publish.yml` 重新部署，列表随之刷新。

### 为什么必须是「一条一帖」（2026-11 用户反馈修复）

GitHub 的邮件通知粒度是 **Discussion 级**：谁在某条 discussion 里留过言就会被自动 watch，之后该 discussion 下的**每一条**评论都会给他发邮件，而且**没有** per-thread / per-reply 订阅可以配置，giscus 也没有这个能力。旧结构（一条大 Discussion 装全部说说）的直接后果就是：任何留过言的人都会收到之后所有无关说说的回复通知。改成一条一帖后，访客只会收到自己参与过的那一条的通知。**这是本页面的核心约束，任何「合并回一条 discussion」的想法都会把这个 bug 带回来。**

## 关键文件

- 页面：`src/pages/ShuoShuo.tsx`（列表）、`src/pages/ShuoShuoDetail.tsx`（详情 + giscus）
- 组件：`src/components/DiscussionCard.tsx`（列表卡）、`src/components/DiscussionMarkdown.tsx`（轻量 Markdown 渲染）
- 数据：`scripts/fetch-discussions.mjs`（构建期抓列表）、`src/services/discussions.ts`（eager glob 内联）、`src/utils/discussion-core.mjs`（纯函数：归一化/排序/标题/摘要/URL）
- 配置：`config/comments.config.json` 的 `shuoshuo`（`categoryName` / `categoryId` / 旧 `discussionId`）；`.pages.yml` 的 `commentsConfig.shuoshuo` 字段
- 迁移：`scripts/migrate-discussions.mjs` + `scripts/lib/discussion-migrate-core.mjs`（把旧合集讨论里的历史评论搬成独立 Discussion）
- 路由：`config/routes.mjs` 的 `/shuoshuo`（`ssg: 'static'`）与 `/shuoshuo/:number`（`ssg: 'discussions'`，逐条预渲染）
- 发布：`.github/workflows/discussion-publish.yml` → `scripts/dispatch-deploy.mjs`

## 修改规则（必须遵守）

1. **一条说说一条 Discussion**：不得把说说合并回「一条 Discussion 装所有说说」，也不得改回「在评论区里发说说」。原因见上文「为什么必须是一条一帖」。
2. **详情页 `mapping="number"` 不可回退**：`term` 必须是该条 Discussion 的**编号**。`mapping="specific"` 会按标题模糊搜索、找不到就自动建讨论，会把说说发到错误分类；`pathname` 会按页面路径另建线程，等于又变回「一个页面一条讨论」。
3. **列表不内嵌 giscus**：列表页只展示条目并链到详情页。在列表页挂评论区等于让访客订阅整个列表（旧 bug 的另一种形态）；`ShuoShuo.test` 有负向断言。
4. **构建期数据，不在浏览器里抓 GitHub**：列表由 `fetch-discussions.mjs` 在构建期抓成 `generated/discussions.json`（需要 `GITHUB_TOKEN`，CI 必须由 build 步骤 `env:` 注入）。前端只读这份内联数据 —— 不要在页面里发 GraphQL 请求（令牌暴露 + 首屏空窗）。
5. **抓不到数据要如实降级**：`discussions.json` 缺失（无 token / API 失败 / 分类未配置）时，`hasDiscussionList()` 为 false，页面显示「取不到」错误态；**「没有内容」与「拿不到数据」必须用不同文案**，不得把失败伪装成空列表。
6. **旧合集讨论不进入列表**：`shuoshuo.discussionId` / `guestbook.discussionId` 指向迁移前的合集讨论，抓取时按编号排除（它是备份，不是一条内容）。留着它会让列表多出一条标题叫「说说」的假条目。
7. **迁移正文的痕迹必须剥离**：迁移过来的 Discussion 正文头部有 `<!-- pldduck-migrated:<源评论id> -->` 标记与一行 `> 由 @xxx · 原发布于 YYYY-MM-DD 的旧说说迁移` 署名。渲染与摘要/标题派生都必须先过 `stripMigrationArtifacts()` —— HTML 注释在 Markdown 里会显示成字面量，漏一处页面上就会出现 `<!-- pldduck-migrated:DC_kw... -->`。原作者用 `readMigrationByline()` 单独展示（详情页脚注），不得丢掉（新讨论作者必然是仓库主）。
8. **发布 = 新建 Discussion + 重新部署**：新建 discussion 不改仓库文件，`push` 类 workflow 不会跑，所以 `discussion-publish.yml` 负责 dispatch `deploy.yml` 一次；`GITHUB_TOKEN` 可以 dispatch（需 `actions: write`）但它的 push 不触发任何 workflow。
9. **编辑式页头与卡片化**：页头是 `rounded-overlay bg-surface p-6 md:p-8` 卡片（`h1` `font-sans text-4xl md:text-5xl` + 低对比介绍 + 通知口径说明），条目卡是 `rounded-overlay bg-surface`。**不得**恢复跨页 `border-b` 发丝线或英文大写眉题。
10. **SEO**：详情页输出 `SocialMediaPosting` JSON-LD 与页面级 `<Seo>`；`meta description` 走 `buildDiscussionMetaDescription()`（短内容补齐到 50–160，纯函数、不依赖时钟）。列表页输出 `CollectionPage` + `ItemList`。
11. **评论审核（与文章/留言板同一链路）**：说说的 Giscus 评论同样由 Akismet / 关键词过滤 / 全量复查处理；`scripts/lib/comment-surface.mjs` 现在**按分类名**识别区域（`surface=shuoshuo`），因为一条一帖之后编号不再固定。**不得**在 workflow 或脚本里按分类把说说评论排除掉。
12. **旧深链兜底**：`/shuoshuo/<非数字>` 是自建管线时代的旧深链，`ShuoShuoDetail` 用 `<Navigate replace>` 回列表页（与改造前的 301 契约一致）。数字编号是新详情页，不要一起 301 掉。

## 常见陷阱

- **把 `data-mapping` 改成 `specific`/`pathname`**：会静默变成「按标题/路径自动建线程」，看起来能显示评论，但会把说说建到错误分类、并重新引入通知问题。
- **在列表页挂 `GiscusComments`**：任何访客只要在列表留过言就订阅全部说说。评论区只能在详情页。
- **忘记剥离迁移标记**：`dist/shuoshuo/<n>/index.html` 里会直接出现 HTML 注释字面量。改渲染/摘要路径时跑 `src/utils/discussion-core.test.ts`（有专门用例）。
- **迁移脚本重复执行**：迁移是幂等的（标记去重），但**真正执行前先跑预演**（不加 `--apply`）。迁移只新建、不改不删原评论 —— 原合集讨论完整保留作备份。
- **图片是原始绝对 URL**（`https://img.pldduck.com/...`），迁移后仍可用；列表图片墙用 `ProgressiveImage`，站内 `/` 开头的路径要过 `assetUrl()`。
- **`giscus.json` 的 `origins` 限制**：本地 `http://localhost:*` 预览时 giscus 不会加载（评论区留空是预期的），不要把它当成 bug 去改 origins 或改回其它 mapping。
- **新说说要等部署**：Discussions 里新建后，站点列表要等 `discussion-publish.yml` → `deploy.yml` 跑完才更新（在 GitHub 网页端建的会自动触发；本地/脚本建的需手动 dispatch 或等下一次部署）。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
