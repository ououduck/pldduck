# pldduck · 跑路的duck

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)
![Vite](https://img.shields.io/badge/vite-6-646cff.svg)
![CI](https://github.com/ououduck/pldduck/actions/workflows/ci.yml/badge.svg)

个人站点「跑路的duck」的完整源码：全站 HTML 于构建期直出，客户端以 SPA 水合运行。

**在线地址**：<https://www.pldduck.com> ｜ **联系邮箱**：<i@pldduck.com>

</div>

## 关于本站

站点基于 React 19 + Vite 6 + TypeScript 构建，预渲染（SSG）与客户端水合并行：正文在未执行 JavaScript
的情况下依然可读，交互能力在水合后补齐。首页是全站导流门户，其下挂载以下内容与工具：

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 门户首页 | `/` | 站点简介、栏目入口、最新文章 / 说说 / 友链 |
| 文章 | `/posts`、`/post/:id` | Markdown 驱动，构建期校验 frontmatter、分类白名单并过滤草稿 |
| 归档 / 标签 / 统计 | `/archive`、`/tags`、`/stats` | 由构建期生成的站点数据派生 |
| 说说 | `/shuoshuo`、`/shuoshuo/:id` | 短动态，每条生成独立静态页 |
| 友情链接 | `/friends` | 可申请交换，含自动检测与人工审核流程（见「友链交换」） |
| 留言板 | `/guestbook` | Giscus 单讨论模式，与文章评论共用同一条反垃圾链路 |
| 站内搜索 | `/search`、`Ctrl/Cmd + K` | 构建期生成索引，命令面板与独立搜索页共用同一套多维权重评分 |
| 封面生成器 | `/cover` | 配图裁切与文字排版，支持批量导出 ZIP |
| 水印工具 | `/watermark` | 图片处理全部在浏览器本地完成，原图不上传 |

阅读体验方面提供目录导航、阅读进度恢复、专注阅读模式、代码高亮与折叠、KaTeX 公式、Mermaid 图表、
图片预览、深浅色双态（经 `View Transitions` 过渡）、侧边栏图标条（鼠标移入展开为浮层）以及
Service Worker 离线壳；同时输出 OG/Twitter Card、JSON-LD、RSS（`/feed.xml`）、Sitemap 与 `llms.txt`。
所有动效均尊重 `prefers-reduced-motion`。

## 背景与对外承诺

本仓库由原先分开的两个站点合并而来：个人主页 **Dworld**（`www.pldduck.com`）与静态博客 **D-blog**
（`blog.pldduck.com`）。合并后单域提供服务，功能页拆为同域子路径。两条长期承诺：

- **文章地址不变**：`/post/<id>` 与旧博客逐字节一致，既有链接、书签与搜索收录直接沿用。
- **旧域名只跳转、不服务**：旧博客仓库已封存为 `ououduck/D-blog-old`，在 Cloudflare Pages 上以
  `_redirects` 将 `blog.pldduck.com` 的每个路径 301 到本站同一位置，根路径返回 200 的迁移公告。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 前端框架 | React 19、React Router 7 |
| 构建 | Vite 6（客户端与 SSR 双构建）、TypeScript |
| 样式 | Tailwind CSS + PostCSS |
| 动画 | Framer Motion、CSS View Transitions API |
| Markdown | react-markdown、remark-gfm/math、rehype-highlight/katex |
| 安全 | DOMPurify（所有富文本渲染前净化） |
| 其他 | Mermaid、KaTeX、highlight.js、Lucide、gray-matter、sharp、undici |

## 快速开始

环境要求：Node.js >= 20，npm >= 10。

```bash
git clone https://github.com/ououduck/pldduck.git
cd pldduck
npm install
cp .env.example .env          # 可选：覆盖站点 URL 与子路径（Windows 使用 copy）
npm run dev                   # 本地开发，默认 http://localhost:3000
```

`.env` 中两个变量的作用：`VITE_SITE_URL` 为站点公开地址（影响 canonical、OG、RSS、Sitemap），
`VITE_BASE_PATH` 仅在子路径部署时需要。

提交或发布前的自查顺序：

```bash
npm run check        # 数据生成与全量校验 + 类型检查
npx eslint .         # 代码风格与潜在错误
npm test             # 单元测试（Vitest）
npm run build        # 完整生产构建（含产物与 SEO 审计）
npm run audit:seo    # 单独复核全站 SEO 清单
```

## 项目结构

```text
pldduck/
├── config/                    # 站点与内容配置、tsconfig、tailwind、postcss；routes.mjs 为路由唯一数据源
├── posts/ shuoshuo/ friends/  # 文章 Markdown、短动态 Markdown、友链 JSON（每项一个文件）
├── generated/                 # 构建产物：posts.json / posts-search.json / site-stats.json 等
├── public/                    # favicon、PWA 图标、sw.js、offline.html 与生成的 feed / sitemap
├── scripts/                   # 构建与自动化脚本，lib/ 为共享的 HTTP 安全与日志模块
├── src/
│   ├── components/            # Layout、SiteSidebar、Seo、TableOfContents、ImageViewer 等
│   ├── pages/                 # 页面组件（懒加载）；cover/、watermark/ 为各自模块集
│   ├── services/              # posts / friends / shuoshuo / readingHistory 等数据访问
│   ├── hooks/ utils/          # 自定义 Hook 与工具函数；utils 下 *.mjs 为客户端与构建脚本共享逻辑
│   ├── ssr/routeData.tsx      # SSG 路由数据构造与客户端读取
│   └── App.tsx / index.tsx    # 路由与渲染入口
├── docs/                      # 内容工作流与部署文档
├── ai-rules/                  # 各功能模块的约束清单（改动前必读）
├── .pages.yml                 # PagesCMS 配置（后台编辑内容）
└── .github/workflows/         # 部署、评论审核、友链检测、更新通知、外链扫描
```

`generated/`、`public/feed.xml` 与 Sitemap 均为构建产物，不应手工编辑。

## 配置

站点配置按用途拆成三份，加载时合并为同一个 `siteConfig` 对象（消费方无需感知拆分）：

| 文件 | 内容 | PagesCMS 集合 |
| --- | --- | --- |
| `config/site.config.json` | 标题、描述、SEO、logo、社交、作者、备案、内容开关 | 站点配置 |
| `config/portal.config.json` | 首页门户文案：标语、状态、标签、入口、链接、项目 | 首页内容 |
| `config/comments.config.json` | Giscus 评论与留言板参数 | 评论与留言板 |

另有 `config/content.config.json`（`postCategories` 分类白名单）与 `config/routes.mjs`（路由清单，
预加载 / SSG / sitemap / 离线兜底全部由此派生）。

## 构建流程

`npm run build` 依次执行 9 个阶段：数据生成 → OG 卡片 → 客户端构建 → Service Worker 版本注入
→ SSR 构建 → 模板快照 → SSG 预渲染 → 产物审计 → SEO 审计，任一阶段失败立即终止。

常用命令（完整列表见 `package.json`）：

| 命令 | 功能 |
| --- | --- |
| `npm run dev` / `preview` | 开发服务器 / 预览生产构建 |
| `npm run build` / `build:verbose` | 生产构建 / 保留完整构建日志的详细模式 |
| `npm run gen:data` | 数据生成与全量校验（frontmatter、文章 ID、图片与链接） |
| `npm run check` / `typecheck` | 数据生成 + 类型检查 / 仅类型检查 |
| `npm run test` / `test:coverage` | 单元测试 / 覆盖率（均先执行 `gen:data`） |
| `npm run audit:build` / `audit:seo` | 产物完整性审计 / SEO 清单审计 |
| `npm run lint` / `format` | ESLint / Prettier（`*:fix`、`format:check` 为检查态） |
| `npm run check:links` | 扫描文章外链失效情况 |

## 友链交换

本站开放友情链接，流程全部公开可查：

1. 打开 <https://www.pldduck.com/friends>，展开「申请友链」，按面板内信息把本站挂到你的站点上。
   **链接必须是服务端直出的 `<a href>`**——Vue / React 用 JavaScript 渲染的友链挂件，静态抓取看不到。
2. 点击「通过 GitHub 申请友链」，用 Issue 表单填写站点名称、地址、简介、头像与反链页面。
3. GitHub Actions 会先探测你的站点与头像在境外能否访问（开启「禁海外」会被判定为不可达并自动关闭 Issue，
   解除屏蔽后重开 Issue 即可重新检测），随后静态抓取反链页面并公示检测证据。
4. **检测结果只作为审核参考，是否收录由站长确认。** 站长按「收录」标签后，机器人生成 `friends/<slug>.json`
   并自动触发部署；按「拒绝」标签则回复固定文案并关闭 Issue。
5. 已收录条目如需修改名称、地址、简介或头像，请直接邮件联系 <i@pldduck.com>。
6. 条目生效需要等待那次部署跑完，提交后不会立即出现在友链页。

友链数据以「一站一文件」的形式存放在 [`friends/`](https://github.com/ououduck/pldduck/tree/main/friends)，
可在 GitHub 上直接查阅。

## 部署

采用 **GitHub Actions 构建 + Cloudflare Workers Static Assets 直传**（assets-only，无运行时函数）。
日常 push 不触发部署，仅手动触发：在 Pages CMS 侧边栏点击「部署到 Cloudflare Worker」，
或在 Actions 中手动运行 `deploy.yml`（payload 最小可用 `{"repository":{"ref":"main"}}`）。

仓库需要配置的 Secrets：`CLOUDFLARE_API_TOKEN`（Workers Scripts:Edit 权限）、`CLOUDFLARE_ACCOUNT_ID`、
`FEISHU_WEBHOOK_URL`、`AKISMET_API_KEY`。Worker 名称为 `pldduck`（见 `wrangler.jsonc`）；
`d-blog` 是旧博客迁移跳转页所用的独立 Worker，两者不可复用。

平台一次性配置、其他平台所需的 SPA fallback、Service Worker 缓存策略、自动化与通知、外链扫描，
见 [docs/deployment.md](docs/deployment.md)。

## 反馈与协作

本站为个人站点，内容以站长笔述为准。Issues 已开放，请按用途选择入口：

- **交换友链**：使用「友链申请」Issue 模板（流程见上文）。
- **其他问题**：直接开 Issue 说明现象与预期即可，或邮件联系 <i@pldduck.com>。

改动代码前请先阅读 [AGENT.md](AGENT.md) 与 [ai-rules/](ai-rules/README.md)：其中记录的是各模块的
既有约束与踩过的坑（构建契约、检测口径、安全边界），并非风格建议。

## 文档

- [内容工作流](docs/content-workflow.md)：新建文章、Markdown 增强能力、友链申请、说说、留言板、Giscus 换仓配置
- [部署与自动化](docs/deployment.md)：双平台直传、SPA fallback、离线策略、飞书通知、外链扫描
- [AI 开发者约束](AGENT.md) 与 [功能规则集](ai-rules/README.md)：修改任何功能前的必读项

## 许可

源代码与仓库内内容以 [MIT](./LICENSE) 许可发布。

## 备案

湘ICP备2025101669号
