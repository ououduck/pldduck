# pldduck · 跑路的duck

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)
![Vite](https://img.shields.io/badge/vite-6-646cff.svg)
![CI](https://github.com/ououduck/pldduck/actions/workflows/ci.yml/badge.svg)

个人站点。首页是导流门户，其下挂静态博客、说说、友链、留言板与两个在线小工具。
React 19 + Vite 6 + TypeScript，构建期直出全站 HTML（SSG），客户端以 SPA 水合运行。

**在线地址**：<https://www.pldduck.com>

</div>

## 背景

本仓库由原先分开的两个站点合并而来：个人主页 **Dworld**（`www.pldduck.com`）与静态博客
**D-blog**（`blog.pldduck.com`）。合并后单域提供服务，功能页拆为同域子路径。两条对外契约：

- **文章地址不变**：`/post/<id>` 与旧博客逐字节一致，旧链接、书签与搜索收录直接沿用。
- **旧域名只跳转不服务**：旧博客仓库已封存为 `ououduck/D-blog-old`，在 Cloudflare Pages 上用
  `_redirects` 把 `blog.pldduck.com` 每个路径 301 到本站同一位置；根路径返回 200 的迁移公告。

## 功能

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 门户首页 | `/` | 站名与自我介绍、站点入口、最新文章 / 说说 / 友链，纯静态直出 |
| 文章 | `/posts`、`/post/:id` | Markdown 驱动，构建期校验 frontmatter、分类白名单与草稿过滤 |
| 归档 / 标签 / 统计 | `/archive`、`/tags`、`/stats` | 由构建期站点数据派生 |
| 说说 | `/shuoshuo`、`/shuoshuo/:id` | 朋友圈式短动态，每条独立静态页 |
| 友链 | `/friends` | 数据为 `friends/*.json`，申请走 Issue + Actions 自动校验反链 |
| 留言板 | `/guestbook` | Giscus 单讨论模式，与评论共用反垃圾链路 |
| 站内搜索 | `/search`、`Ctrl/Cmd + K` | 构建期索引 + 多维权重评分，命令面板与独立页共用 |
| 工具 | `/cover`、`/watermark` | 封面生成器（批量 ZIP 导出）、水印工具（图片不离开浏览器） |

阅读与呈现：目录导航、阅读进度恢复、专注阅读模式、代码高亮与折叠、KaTeX、Mermaid、
图片预览、深浅色双态（`View Transitions` 过渡）、侧边栏可折叠导航、Service Worker 离线壳、
OG/Twitter Card、JSON-LD、RSS、Sitemap、`llms.txt`。动效一律尊重 `prefers-reduced-motion`。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 前端框架 | React 19 + React Router 7 |
| 构建工具 | Vite 6（客户端 + SSR 双构建） |
| 样式 | Tailwind CSS + PostCSS |
| 动画 | Framer Motion + CSS View Transitions API |
| Markdown | react-markdown + remark-gfm/math + rehype-highlight/katex |
| 安全 | DOMPurify |
| 其他 | Mermaid、KaTeX、highlight.js、Lucide、gray-matter、sharp、dotenv |

## 快速开始

```bash
git clone https://github.com/ououduck/pldduck.git
cd pldduck
npm install
cp .env.example .env          # 可选：覆盖站点 URL 与子路径（Windows 用 copy）
npm run dev                   # 本地开发（http://localhost:3000）
```

Node.js >= 20，npm >= 10。提交前自查：

```bash
npm run check && npx eslint . && npm test && npm run build && npm run audit:seo
```

## 项目结构

```text
pldduck/
├── config/                  # 站点/内容配置、tsconfig、tailwind、postcss；routes.mjs 是路由唯一数据源
├── posts/ friends/ shuoshuo/  # Markdown 文章、友链 JSON、说说（短动态）
├── ai-rules/                # 各功能模块的 AI 修改规则（硬性约束）
├── AGENT.md                 # AI 开发者总行为准则
├── docs/                    # 内容工作流与部署细节文档
├── .pages.yml               # PagesCMS 配置
├── generated/               # 构建产物：posts.json / posts-search.json / site-stats.json 等
├── public/                  # favicon、PWA 图标、sw.js、offline.html 与构建生成的 feed/sitemap
├── scripts/                 # 构建/自动化脚本（lib/ 为共享 HTTP 与日志库）
├── .github/workflows/       # 部署、评论审核、更新通知、外链扫描
└── src/
    ├── components/          # Layout、SiteSidebar、Seo、TableOfContents、ImageViewer 等
    ├── pages/               # 页面组件（懒加载）；cover/、watermark/ 为模块集
    ├── services/            # posts / friends / shuoshuo / readingHistory 等
    ├── hooks/ utils/        # 自定义 Hook 与工具函数；utils 下 *.mjs 为客户端与构建脚本共享逻辑
    ├── ssr/routeData.tsx    # SSG 路由数据构造与客户端读取
    └── App.tsx / index.tsx  # 路由与渲染入口
```

## 配置

站点配置按用途拆成三份，加载时合并为同一个 `siteConfig` 对象（消费方无需感知拆分）：

| 文件 | 内容 | PagesCMS 集合 |
| --- | --- | --- |
| `config/site.config.json` | 标题、描述、SEO、logo、社交、作者、备案、内容开关 | 站点配置 |
| `config/portal.config.json` | 首页门户文案：标语、状态、标签、入口、链接、项目 | 首页内容 |
| `config/comments.config.json` | Giscus 评论与留言板参数 | 评论与留言板 |

另有 `config/content.config.json`（`postCategories` 分类白名单）与 `config/routes.mjs`（路由清单，
预加载 / SSG / sitemap / 离线兜底全部由此派生）。环境变量见 `.env.example`：
`VITE_SITE_URL`（站点公开地址）、`VITE_BASE_PATH`（子路径部署时使用）。

## 构建与命令

`npm run build` 依次执行 9 个阶段：数据生成 → OG 卡 → 客户端构建 → service worker 版本注入
→ SSR 构建 → 模板快照 → SSG 预渲染 → 产物审计 → SEO 审计，任一阶段失败立即终止。
`generated/`、RSS 与 Sitemap 均为构建产物，不应手工编辑。

| 命令 | 功能 |
| --- | --- |
| `npm run dev` / `preview` | 开发服务器（3000）/ 预览生产构建 |
| `npm run build` / `build:verbose` | 生产构建 / 详细模式 |
| `npm run gen:data` | 数据生成 + 全量校验（frontmatter、文章 ID、图片与链接） |
| `npm run audit:build` / `audit:seo` | 产物完整性 / 全站 SEO 清单审计（均已接入 build） |
| `npm run check` / `typecheck` | 数据生成 + 类型检查 / 仅类型检查 |
| `npm run test` / `test:coverage` | Vitest 单元测试 / 覆盖率（先执行 `gen:data`） |
| `npm run lint` / `format` | ESLint / Prettier（`*:fix`、`format:check` 为检查态） |
| `npm run check:links` | 扫描文章外链失效（详见 `docs/deployment.md`） |

## 部署

**GitHub Actions 构建 + Cloudflare Worker 直传**（Workers Static Assets，assets-only）。日常 push 不触发部署，
仅手动触发：① Pages CMS 侧边栏「部署到 Cloudflare Worker」；② Actions 手动 Run `deploy.yml`
（payload 最小可用 `{"repository":{"ref":"main"}}`）。

仓库 Secrets：`CLOUDFLARE_API_TOKEN`（Workers Scripts:Edit 权限）、`CLOUDFLARE_ACCOUNT_ID`、
`FEISHU_WEBHOOK_URL`、`AKISMET_API_KEY`。Worker 名称为 `pldduck`（见 `wrangler.jsonc`），
**不要改回 `d-blog`**——那个名字属于旧博客的迁移跳转页，复用会互相覆盖。

细节（平台一次性配置、其他平台 SPA fallback、Service Worker 策略、自动化与通知、外链扫描）见
[docs/deployment.md](docs/deployment.md)。

## 文档

- [内容工作流](docs/content-workflow.md) — 新建文章、Markdown 增强、友链申请、说说、留言板、Giscus 换仓配置
- [部署与自动化](docs/deployment.md) — 双平台直传、SPA fallback、离线策略、飞书通知、外链扫描
- [AI 开发者约束](AGENT.md) 与 [功能规则集](ai-rules/README.md) — 修改任何功能前必读；
  打破规则（含修改 `ai-rules/` 文档）必须先取得用户授权，并在提交信息中注明「依据用户授权破例」

## 许可证

[MIT](./LICENSE)
