# 评论系统（Giscus）— AI 修改规则

## 功能概述

站内评论只剩**文章评论区**：每篇文章页尾部一个 Giscus 评论区，评论由 GitHub Discussions 承载。实现要点：接近视口才注入 giscus 脚本（懒加载）、多来源回退链（配置 origin → 官方兜底）、8s 单源超时 + 一轮自动重试、深色主题（全站固定 dark）、构建期评论数快照。加载动画直接渲染，不套内层边框/底色块；离线/错误提示可用弱底色块，但不再用上下 `border-y` 发丝线围绕加载动画。

**2026-11 结构收敛**：说说与留言板的评论区已下线 —— 留言板整页删除（`/guestbook`、`/guestbook/:id` 与 `src/pages/Guestbook*.tsx` 全部移除，`public/_redirects` 301 回 `/posts`），说说改为纯 Markdown 内容管线（`shuoshuo/*.md`，每 10 条一页，`src/pages/ShuoShuo.tsx` 不含任何 Giscus）。因此不存在「列表页评论区」「逐条内容评论区」「三区域审核」这些形态，只有文章评论区一种，评论治理口径见 [comment-moderation.md](comment-moderation.md)。

## 关键文件

- `src/components/GiscusComments.tsx`（回退链、超时/重试、主题同步、占位与错误态）
- `src/pages/Post.tsx`（**唯一挂载点**：`<GiscusComments postId={post.id} />`）
- `scripts/fetch-giscus-comments.mjs`（构建期评论数快照，只统计文章讨论）
- `scripts/lib/comment-surface.mjs`（Discussion 分类 → surface，判定见 [comment-moderation.md](comment-moderation.md)）
- `config/comments.config.json`（顶层只有 `giscusEnabled` 与 `comments` 两段）
- `giscus.json`（仓库根，Giscus App 的 `origins` 白名单）
- `public/_headers`（CSP 的 `script-src` / `frame-src` 放行 `https://giscus.app`）

## 修改规则（必须遵守）

1. **回退链**：来源解析（`resolveGiscusOrigins`）保持「配置 origin → 官方兜底」的有序回退；8s 单源超时 + 一轮自动重试（`MAX_AUTO_RETRIES`）的既有机制不得移除。`comments.origin` 是绝对地址时直接使用，是相对路径时解析为当前页面 origin + 路径（需自备同源代理）；官方 `https://giscus.app` 恒为最后一级兜底，因此 origins 列表永远非空。
2. **非法配置容错**：`origin` 非法（不是可解析的 http(s) 地址）时必须在来源解析阶段过滤，禁止把裸值塞进 `new URL()` 后在 `message` 处理器里抛 TypeError 中断监听（事件处理器异常不进入 React 错误边界）。
3. **成功判定兜底**：`isLoaded` 依赖 giscus 的 postMessage 握手；改动时需同时考虑 iframe `load` 兜底信号，防止占位常驻。成功消息到达后必须清掉超时与待触发的自动重试。
4. **深色主题固定**：全站 `<html class="dark">`，giscus 初始 `theme=dark`；`MutationObserver` 监听 `<html class>` 与容器子节点变化后补发 `setConfig.theme` 的机制保留（用于 iframe 就绪前丢失的那次握手），但站内已无浅色主题切换分支，不要新增浅色分支。
5. **pathname 映射**：文章评论固定 `mapping="pathname"` —— Giscus 以文章页面 URL 的 pathname 作为 Discussion 标题并自动建讨论。文章评论**不得**改成 `number` / `specific`：`specific` 会按标题文本模糊搜索（搜不到就另建讨论），`number` 需要固定编号，两者都会让「一篇文章一个讨论」失效。缺 term 时禁止静默注入 `data-term`。
6. **构建期评论数**：`scripts/fetch-giscus-comments.mjs` 用 `fetchWithRetry` 拉全仓库 discussions（GraphQL），**只统计文章评论**：按 `comments.categoryId` 严格过滤分类，再按 pathname 匹配 `withBasePath('/post/<id>')`。失败 / 无 token / 限速 / 无匹配一律 warn 后降级（不阻塞构建，评论数不展示）。脚本已不再有「排除说说/留言分类」的分支（那两段配置已删除），不要把它加回来。
7. **BASE_PATH 匹配口径**：discussion 标题（页面 URL pathname）与文章路由匹配必须叠加 BASE_PATH（`withBasePath`）—— 子路径部署时硬编码 `/post/<id>` 匹配不上，评论数会静默全缺。
8. **挂载点唯一**：只有文章页挂评论区。说说页（`/shuoshuo`、`/shuoshuo/page/<n>`）、任何列表页/聚合页都不得挂 `GiscusComments`；`src/pages/ShuoShuo.test.tsx` 断言页面里不存在 `.giscus-comments`。`GiscusComments` 的 `card` 变体当前站内已无调用点，不要为「独立内容页」恢复它。

## 常见陷阱

- 大陆网络下 giscus.app 可能被 DNS 污染：回退链与超时是核心体验保障，不要简化成单次 `fetch`；
- 评论数快照写入文章数据（`post.commentCount`，由 `generate-site-data` 注入），改动抓取逻辑需同步 SSG 数据流；
- **文章 ID 是对外契约**：文章评论按 `mapping=pathname` 用 `/post/<id>` 匹配线程，改 ID 等于换一条评论区，旧站收录的链接也会一起失效；
- **换仓库/换站点**时 `comments.repo` / `comments.repoId` / `comments.category` / `comments.categoryId` 要一起换；分类（只有「文章评论」一个参与评论链路）**只能在 GitHub 网页端 Discussions 里创建**，REST 与 GraphQL 都没有开放的建分类接口，不要试图用脚本代劳；
- **在列表页挂评论区**：列表页一旦内嵌 `GiscusComments`，访客就等于订阅了整个列表（任何人的评论都会给他发邮件通知）—— 这是 2026-11 修掉的历史 bug，不要再把评论区下放到列表或聚合页；
- **本地预览看不到评论**：来源白名单写在仓库根的 `giscus.json`（只列 `https://www.pldduck.com` / `https://pldduck.com`），`http://localhost:*` 下评论区加载不出来属预期行为，不要为本地预览放宽 origins 或 `public/_headers` 的 CSP；
- **改 `comments.origin` 会连带 CSP**：`public/_headers` 的 `script-src` / `frame-src` 只放行 `https://giscus.app`，把 origin 换成自托管实例或镜像后必须同步放行该域名，否则脚本被 CSP 拦下、评论区静默空白（`scripts/security-headers.test.mjs` 会跟着红）。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
