# 评论过滤与反垃圾（comment-moderation）— AI 修改规则

## 功能概述

评论自动治理，**只审核文章评论区**（Giscus → GitHub Discussions）：Akismet 反垃圾判定（`akismet-comment-check.mjs`）+ 关键词过滤（`comment-keyword-filter.mjs`，命中即按配置 minimize/delete）+ 全量复查（`comment-keyword-recheck.mjs`，手动触发，遍历仓库内全部 discussion 的评论）。区域识别由 `scripts/lib/comment-surface.mjs` 统一提供：站内只有「文章评论」一个受管区域，其它分类一律归为 unknown。配置在 `config/comment-keywords.json` 与 `config/comments.config.json`。

**2026-11 收敛**：留言板整页删除、说说的评论区下线，评论只剩文章评论区；`COMMENT_SURFACES` 因此只有 `ARTICLE` 与 `UNKNOWN` 两个取值，历史分类（「说说」「留言板」）不再有自己的 surface，也不再参与任何区域专属逻辑。

## 关键文件

- `scripts/akismet-comment-check.mjs`（Akismet 判定 + GraphQL 删除）
- `scripts/comment-keyword-filter.mjs` / `scripts/comment-keyword-recheck.mjs`
- `scripts/lib/keyword-filter-core.mjs`（匹配与豁免核心，共享）
- `scripts/lib/comment-surface.mjs`（Discussion 分类名 → surface，唯一区域判定入口）
- `scripts/lib/http.mjs`（fetchWithRetry/超时/错误分类）
- `scripts/feishu-webhook.mjs`（新评论/新讨论通知，按 surface 标注区域）
- `.github/workflows/{akismet-discussion-comment-check,comment-keyword-filter,comment-keyword-recheck,feishu-webhook}.yml`

## 修改规则（必须遵守）

1. **宁可漏删不误删**：判定为 undetermined（网络失败/无法确认）时必须放行评论并告警，禁止默认删除。
2. **超时语义**：外层信号只做总预算（单次超时 × (重试+1) × 2），单次超时与重试由 fetchWithRetry 管理 —— 禁止外层与内层同长（会废掉重试）。
3. **已处理跳过**：已最小化（isMinimized）的评论不得重复处理（recheck 语义）。
4. **重试语义**：429/5xx 按 fetchWithRetry 退避重试；权限类 403 必须区分（不按限流等待）。
5. **配置语义**：comment-keywords.json 的 action（minimize/delete/none）由配置决定，脚本忠实执行；**修改关键词表属于内容策略，需用户确认**。
6. **GraphQL 载荷**：评论/讨论处理 mutation 的查询字段与结果解析保持一致；错误必须可诊断。
7. **区域判定只有一处**：区域一律走 `resolveCommentSurface({ categoryName, articleCategoryName })`，禁止在脚本或 workflow 里另写分类名比较、编号白名单或按 `giscus[bot]` 排除文章评论。判定口径：分类名 trim 后等于 `comments.config.json` 的 `comments.category`（默认「文章评论」）即 `article`，其余（含缺失分类名、历史上的「说说」「留言板」）一律 `unknown`；分类名与编号冲突时**以分类名为准**。
8. **配置读取容错**：`loadCommentSurfaceConfig()` 只返回 `{ articleCategoryName }`，文件缺失/损坏时返回 `null`（调用方按 `unknown` 兜底），不得因为展示层配置问题阻断反垃圾链路，也不得在该函数里重新引入 `shuoshuo` / `guestbook` 段。
9. **non-article 区域的处理口径（见代码，勿想当然）**：surface 目前用于日志分组、复查结果表与飞书通知的「区域」标注（`article` → 「文章评论」，其余 → 「讨论区」）。**当前脚本没有在 unknown 时提前返回** —— Akismet 与关键词动作对 discussion 事件照常执行。因此不得在文档或注释里声称「unknown 已被跳过」；若确实要按区域差异化处理，必须在四个脚本里显式加判定、补 `scripts/lib/comment-surface.test.mjs` 用例，并同步本文件。

## 常见陷阱

- Akismet workflow 与关键词过滤 workflow 都监听 `discussion_comment: created`（双过滤器设计），处理失败是告警噪音而非数据损坏；
- 关键词过滤另监听 `discussion: created`（防有人直接在 GitHub 上开讨论灌水），全量复查则遍历仓库内全部 discussion 的评论 —— 二者都不按站点页面区分区域，改动时不要假设「只有文章评论会被扫到」；
- Akismet key 在 URL 子域中，日志必须脱敏（sanitizeUrlForLogs）；
- 机器人豁免（`keyword-filter-core.mjs` 的 `ALWAYS_EXEMPT_USERS`，含 `giscus[bot]`）只针对机器人账号自身，**不是**按分类排除文章评论；仓库主也不再自动豁免，需要豁免就写进配置的 `exemptUsers`；
- 已下线区域的历史讨论仍在 GitHub 上：它们被判定为 `unknown`，但脚本不会因此跳过处理 —— 不要靠「删掉分类名」来让某类讨论免审。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
