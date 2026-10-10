# 配置体系（config）— AI 修改规则

## 功能概述

站点/构建/内容配置分层：站点配置按用途拆成三份 JSON（`config/site.config.json` 站点信息、`config/portal.config.json` 首页门户、`config/comments.config.json` 评论与留言板，三者 CMS 均可编辑），构建期加载器与运行期 `config/site.config.ts` **各自合并回同一份对象**再交给消费方，因此 `siteConfig.portal` / `siteConfig.comments` / `siteConfig.guestbook` 的读取形状与拆分前一致；另有 `config/content.config.json`（分类白名单等）、构建配置（tsconfig/tailwind/postcss/vite）、环境变量（.env.example）。

## 关键文件

- `config/site.config.json` / `config/portal.config.json` / `config/comments.config.json` + `scripts/site-config-loader.mjs`（fail-closed 加载 + 三份合并）
- `config/site.config.ts`（同一份三文件合并的 TS 出口，字段类型接口的唯一归属地）
- `config/routes.mjs`（路由清单唯一数据源，见 [routes-single-source.md](routes-single-source.md)）
- `config/content.config.json`
- `config/tsconfig.json` / `tailwind.config.js` / `postcss.config.js`
- `vite.config.ts` / `vite.ssr.config.ts` / `vitest.config.ts`
- `.env.example`（环境变量文档）

## 修改规则（必须遵守）

1. **fail-closed**：三份配置文件任一缺失/损坏/URL 非法时构建必须抛错中止（禁止静默回退默认值）；合并顺序固定为 `{...site, ...comments, portal}`，三份的顶层键**不得重名**（`scripts/pagescms-config.test.mjs` 有守护）。
2. **CMS 字段白名单同步**：.pages.yml 的 `siteConfig` / `portalConfig` / `commentsConfig` 三个集合的 fields 必须与对应 JSON 实际键一一对应（缺字段 CMS 保存会静默丢字段）；新增配置文件必须同时补集合 + 补漂移测试的 `configCollections`。
3. **环境变量文档化**：脚本实际读取的每个环境变量必须在 .env.example 中注释说明（含默认值/语义/CI vs 本地）；数值型变量支持显式 0（parseEnvNumber 语义）。
4. **构建配置**：修改 tsconfig/vite/tailwind 需全量回归（typecheck + 构建 + 测试）；启用的严格项不得擅自关闭。
5. **路径别名**：`@/*`（src）、`@config/*`（config）语义保持，新增目录不得引入新别名。
6. **依赖升级**：安全相关升级（如 react-router 修复 CVE）优先；major 升级需全量验证并评估迁移成本。
7. **站标双轨**：`siteConfig.logo` / `logoSmall` 只服务**站内展示位**（导航、卡片、JSON-LD
   `publisher.logo`），可以是远程 URL；凡进 canvas 绘制或构建期生成图片的场合（OG 卡片、
   封面生成器默认图标）必须用 `public/` 下的本地底图（`logo.png` / `logo-96.png`）。
   远程图会把 canvas 变成 tainted，`toDataURL()` 直接抛 SecurityError。
8. **标题拼接**：`siteConfig.title` 是全站标题后缀（「页面名 - 站点名」）；只有首页用
   `siteConfig.seoHomeTitle` 逐字覆盖，不参与拼接。改站点名要同时预期 37 个直出 HTML 的
   title 变化，`npm run audit:seo` 是门禁。

## 常见陷阱

- config/ 根目录（构建配置）与 src/config（已删除）勿混淆；
- 站点配置的读者是**两份加载器**（构建侧 mjs + 运行侧 TS），两侧合并逻辑必须同步修改，否则 CI 产物与页面运行时配置不一致；
- site.config.json 的 author/social、comments.config.json 的 comments/guestbook 等嵌套结构被多处消费，增删字段需全局检索消费方。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
