# 配置体系（config）— AI 修改规则

## 功能概述

站点/构建/内容配置分层：站点配置按用途拆成两份 JSON（`config/site.config.json` 站点信息、`config/comments.config.json` 评论与留言板，均可在 CMS 编辑），构建期加载器与运行期 `config/site.config.ts` **各自合并回同一份对象**再交给消费方；另有部署运行配置 `wrangler.jsonc`、构建配置（tsconfig/tailwind/postcss/vite）、环境变量（.env.example）。文章 category 已删除，随之配套的白名单配置文件也已从 `config/` 移除：构建期不再校验 category，文章元数据只有 `tags`。历史门户配置 `config/portal.config.json` 已于 2026-11 整体移除（首页早已改为小部件布局、不再消费它）。

## 关键文件

- `config/site.config.json` / `config/comments.config.json` / `config/friend-blacklist.json` + `scripts/site-config-loader.mjs`（fail-closed 加载 + 两份站点配置合并；黑名单由 `scripts/lib/friend-blacklist.mjs` 读取）
- `config/site.config.ts`（同一份两文件合并的 TS 出口，字段类型接口的唯一归属地）
- `config/routes.mjs`（路由清单唯一数据源，见 [routes-single-source.md](routes-single-source.md)）
- `config/tsconfig.json` / `tailwind.config.js` / `postcss.config.js`
- `vite.config.ts` / `vite.ssr.config.ts` / `vitest.config.ts`
- `wrangler.jsonc`（Worker 入口、Static Assets、`vars.BETTERSTACK_STATUS_PAGE_ID`）
- `.env.example`（环境变量文档）

## 修改规则（必须遵守）

1. **fail-closed**：两份配置文件任一缺失/损坏/URL 非法时构建必须抛错中止（禁止静默回退默认值）；合并顺序固定为 `{...site, ...comments}`，两份的顶层键**不得重名**（`scripts/pagescms-config.test.mjs` 有守护）。
2. **CMS 字段白名单同步**：.pages.yml 的 `siteConfig` / `commentsConfig` / `friendBlacklist` 集合的 fields 必须与对应 JSON 实际键一一对应（缺字段 CMS 保存会静默丢字段）；新增配置文件必须同时补集合 + 补漂移测试的 `configCollections`。
3. **环境变量文档化**：脚本实际读取的每个环境变量必须在 .env.example 中注释说明（含默认值/语义/CI vs 本地）；数值型变量支持显式 0（parseEnvNumber 语义）。
4. **构建配置**：修改 tsconfig/vite/tailwind 需全量回归（typecheck + 构建 + 测试）；启用的严格项不得擅自关闭。
5. **路径别名**：`@/*`（src）、`@config/*`（config）语义保持，新增目录不得引入新别名。
6. **依赖升级**：安全相关升级（如 react-router 修复 CVE）优先；major 升级需全量验证并评估迁移成本。
7. **站标双轨**：站内展示位（侧栏/顶栏站标、首页作者头像、友链页本站信息、JSON-LD
   `publisher.logo`）默认用 `public/` 下的本地底图 —— `logo` = `/logo.png`（600×600），
   `logoSmall` 与 `author.avatar` = `/logo-96.png`；**不得再回到 QQ 图床直链**（`q1.qlogo.cn`
   限流或需境外网络时页头直接空一块，还多引一个第三方域名）。
   配置值允许是站内相对路径，但消费方式有讲究：渲染处必须过 `assetUrl()`（补 base path），
   进 JSON-LD 的由 `toAbsoluteUrl` / `absoluteSiteUrl` 补全，友链页**给申请人复制的 LOGO 文本
   必须是绝对地址**（相对路径对对方站点毫无意义）。
   凡进 canvas 绘制或构建期生成图片的场合（OG 卡片、封面生成器默认图标）只能用 `public/` 的本地
   底图（`logo.png` / `logo-96.png`）—— 远程图会把 canvas 变成 tainted，`toDataURL()` 直接抛 SecurityError。
8. **标题拼接**：`siteConfig.title` 是全站标题后缀（「页面名 | 站点名」，分隔符固定为竖线）；
   只有首页用 `siteConfig.seoHomeTitle` 逐字覆盖，不参与拼接。JSON-LD 的 `name` 与 SSG
   直出的 `<title>` 必须走同一格式（`scripts/ssg.mjs` / 各页 structuredData）。改站点名或分隔符
   要同时预期全站直出 HTML（首页、静态页与全部文章详情页）的 title 变化，`npm run audit:seo` 是门禁。
9. **`statusPageUrl` 与状态页三处配置分离**：站点配置里的 `statusPageUrl`（`config/site.config.json`，
   PagesCMS「站点配置」集合）只是**公开**的 Better Stack 自定义状态页地址，必须与 Worker 的凭据分开：
   - 前端跳转地址：`statusPageUrl`（当前为站长提供的实际自定义域
     `https://status.pldduck.com`）；构建期可用公开变量 `VITE_BETTERSTACK_STATUS_PAGE_URL` 覆盖，
     两者都只接受 https 绝对地址，非法值由前端统一回退（见 [site-status.md](site-status.md)）。
   - Worker 变量：`BETTERSTACK_STATUS_PAGE_ID` 写在 `wrangler.jsonc` 的 `vars`（非敏感），留空时
     接口返回 unavailable；本地 `wrangler dev` 用已 gitignore 的 `.dev.vars` 覆盖。
   - Worker Secret：`BETTERSTACK_API_TOKEN` **只能**通过 `npx wrangler secret put` 设置，禁止写入
     `site.config.json`、`.env*`、`VITE_*` 变量、`wrangler.jsonc` 或任何提交物。
     `.pages.yml` 的 `siteConfig` 集合必须声明 `statusPageUrl` 字段（缺字段时 CMS 保存会静默丢键，
     `scripts/pagescms-config.test.mjs` 会红）；这三个位置的关系必须与 `.env.example` 的说明保持一致。

## 常见陷阱

- config/ 根目录（构建配置）与 src/config（已删除）勿混淆；
- 看到旧文档/旧代码提到 category 白名单就把它建回来：该配置文件已随文章 category 功能删除，构建期不再校验 category，`generated/posts.json` 也只有 `tags`；新增配置文件必须同时补 `.pages.yml` 集合与漂移测试；
- 站点配置的读者是**两份加载器**（构建侧 mjs + 运行侧 TS），两侧合并逻辑必须同步修改，否则 CI 产物与页面运行时配置不一致；
- site.config.json 的 author/social、comments.config.json 的 comments/guestbook 等嵌套结构被多处消费，增删字段需全局检索消费方；
- `config/portal.config.json` / `siteConfig.portal` 已于 2026-11 整体清理（首页那时早已改为小部件布局、不再消费）：不要再建回这个文件/集合，也不要在首页重新渲染门户入口/开源项目/关于本站/技术栈；新增首页内容请改小部件组件；
- `statusPageUrl` 被误当成「敏感配置」塞进 `.env` 或与 `BETTERSTACK_API_TOKEN` 写在一起：它随前端产物公开下发，放错位置会同时泄露 Token 并让状态入口失效；反之把 Token 写进 `config/site.config.json` 或 `VITE_*` 变量等于公开泄露。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
