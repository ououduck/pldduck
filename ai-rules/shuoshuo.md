# 说说（ShuoShuo）— AI 修改规则

## 功能概述

说说页 `/shuoshuo` 是一个「朋友圈」式短动态流，改由 **giscus 内嵌**承载：

- 数据源：仓库 Discussions 里的一条**公告（Announcements）类型** Discussion（`config/comments.config.json` 的 `shuoshuo.discussionId`，当前为 `4`）。
- 每条 giscus 评论 = 一条说说；**公告分类天然只有写权限者可评论**，等价于「只有作者能发说说，访客可浏览/点赞」。
- 排序：最新在前由仓库根 `giscus.json` 的 `defaultCommentOrder: "newest"` 控制（**全站生效**，giscus 无 per-embed 排序参数）。
- 无独立详情页、无分享弹层、无 `?id=` 定位；旧的 `/shuoshuo/<id>` 深链通过 `public/_redirects` + `App.tsx` 的 `<Navigate replace>` 成对 301 回列表页。

## 关键文件

- 页面：`src/pages/ShuoShuo.tsx`（页头 + `<GiscusComments mapping="number" term={discussionId} />`；`giscusEnabled=false` 时回落 `Surface` 占位面板）。
- 复用组件：`src/components/GiscusComments.tsx`（与文章评论区、留言板同源）。
- 配置：`config/comments.config.json` 的 `shuoshuo.discussionId`；`config/site.config.ts` 的 `SiteShuoshuo` / `SiteConfig.shuoshuo`；`.pages.yml` 的 `commentsConfig.shuoshuo` 字段。
- 排序：仓库根 `giscus.json` 的 `defaultCommentOrder`。
- 路由：`config/routes.mjs` 里 `/shuoshuo`（`ssg: 'static'`，页面级 schemaFromSeo）+ `/shuoshuo/:splat`（301 别名，不预渲染、不进 sitemap）。

## 修改规则（必须遵守）

1. **数据源唯一**：说说内容只在 giscus 承载的公告 Discussion 里；禁止再引入构建期 markdown 解析（`shuoshuo/*.md`）、`generated/shuoshuo.json` 或前端自建列表渲染。
2. **`mapping="number"` 不可回退**：`term` 必须是既有 Discussion 的**编号**（`mapping="specific"` 会按标题搜索、找不到即自动建讨论，会把说说发到错误分类）。若更换 Discussion，改 `comments.config.json.shuoshuo.discussionId`，勿改 mapping。
3. **`giscus.json.defaultCommentOrder` 保持 `newest`**：giscus 无 data-sort 属性，仓库根的这个键是**唯一**排序入口；改成 oldest 会让「最新在前」的产品预期失效。访客浏览器 localStorage 里的临时切换不影响其他访客。
4. **公告分类（Announcements）**：承载说说的那条 Discussion 必须位于 Announcements 类型分类；否则任何登录 GitHub 的访客都能发评论，「只有作者能发说说」的约束即破。分类类型不可在 Discussion 之间迁移——如需要改变，只能重建一条并更新 `shuoshuo.discussionId`。
5. **详情页契约已退役**：`/shuoshuo/:splat → /shuoshuo` 的 301 成对（`_redirects` + `App.tsx`）是外部已索引 URL 的兜底，不得单边删除；若二次改造需要新详情路由，须重新走 `config/routes.mjs` 单一真源流程并同步 `routes-consistency.test.mjs`。

## 常见陷阱

- 评论图片以绝对 URL 存在正文中（`https://img.pldduck.com/...`），giscus 会原样渲染；无需站点侧九宫格逻辑。
- 说说的 SEO 只走**页面级** `<Seo>` + `CollectionPage` schema，**不再枚举 ItemList 子页**；若未来接入自建渲染列表，须同步 `generate-site-data.mjs` 的 sitemap/llms 分支。
- `giscusEnabled=false` 时页面回落占位面板，此时说说内容整站不可见——这是刻意降级路径，勿静默改成「仍然尝试加载」。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
