# 内容校验（post-content-validator）— AI 修改规则

## 功能概述

文章内容构建期校验：Markdown 链接/图片解析（含行号）、站内路由与锚点目标校验、本地图片文件存在性校验；作为 gen:data 的一部分 fail-closed 阻断错误内容进入构建。

站内路由的判定有两档（`scripts/post-content-validator.mjs`）：静态路由清单 `DEFAULT_STATIC_ROUTES`（`/`、`/posts`、`/archive`、`/tags`、`/friends`、`/shuoshuo`、`/cover`、`/watermark`、`/search`、`/privacy`），以及带参数路由的形状正则 `PARAMETERIZED_ROUTE_PATTERNS`（目前只有 `/shuoshuo/page/<n>`）。`/shuoshuo/page/2` 这类分页地址形状合法即放行（页码是否真实存在要到构建期才知道，这里不做存在性判断）；`/shuoshuo/<id>`（逐条说说页已取消）与任何 `/guestbook*`（留言板整页已删除）都不在清单里，一律报 `unknown site route`。

## 关键文件

- `scripts/post-content-validator.mjs`
- `scripts/post-content-validator.test.mjs`（站内路由口径的回归用例）
- `src/utils/headings-core.mjs`（maskFencedCodeBlocks 等共享正则）

## 修改规则（必须遵守）

1. **代码块屏蔽**：围栏/缩进代码块与行内代码（`...` / `...`）中的括号结构**必须**在链接解析前屏蔽（讲解 Markdown 语法的文章会被误杀，这是已修过的真实事故）。
2. **行号准确**：校验错误必须带真实文件行号，便于作者定位。
3. **锚点校验口径**：校验构建端 headingIds 时，与客户端 TOC 的 id 生成必须同源（headings-core）。
4. **fail-closed**：校验错误必须阻止构建（配合 generate-site-data），禁止静默放行。
5. **外链 vs 站内**：站内路由/锚点与外部 URL 的分类判定保持既有规则（不校验外部 URL 可达性，那是 check-broken-links 的职责）。
6. **说说分页只做形状校验**：`/shuoshuo/page/<n>` 的合法性来自 `PARAMETERIZED_ROUTE_PATTERNS`（`^/shuoshuo/page/[0-9]+$`），**不得**在这里改成「查真实页数后放行/拒绝」—— 页数取决于说说条数（`config/shuoshuo.mjs` 的 `shuoshuoPageCount`），校验器不持有该数据；页码非数字（如 `/shuoshuo/page/abc`）仍必须报 `unknown site route`。
7. **已下线路由不得回填**：`/guestbook`、`/guestbook/<n>` 与逐条 `/shuoshuo/<id>` 必须继续被判为 `unknown site route`。不要为了「让旧文章通过」把它们加进 `DEFAULT_STATIC_ROUTES` 或新的形状正则 —— 它们没有对应页面，放行只会产出死链。
8. **清单与路由数据源保持一致**：`DEFAULT_STATIC_ROUTES` 是手写清单（未从 `config/routes.mjs` 派生），增删站内页面时必须同步这里，否则新页面链接会被误判为未知路由、下线页面的链接会被误放行。

## 常见陷阱

- 修改 maskFencedCodeBlocks（headings-core）会影响标题提取与锚点 id —— 必须全量回归；
- 校验通过后 generate-site-data 会继续消费解析结果，两者字段契约一致；
- 新增站点页面后只改 `config/routes.mjs`：内容校验用的静态路由清单是独立副本，文章里指向新页面的链接会报 `unknown site route`（见规则 8）；
- 把「页数超范围」当成内容校验问题：`/shuoshuo/page/999` 形状合法即通过，SSG 只生成真实存在的页，这类地址由前端收敛到合法页码范围，不要在校验器里补一层存在性检查。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
