# pldduck · 跑路的duck

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)
![Vite](https://img.shields.io/badge/vite-6-646cff.svg)
![CI](https://github.com/ououduck/pldduck/actions/workflows/ci.yml/badge.svg)

个人站点「跑路的duck」的完整源码：**构建期直出 HTML，客户端 SPA 水合**。

**在线** <https://www.pldduck.com> · **邮箱** <pldduck@outlook.com>

</div>

## 特性

- **静态优先**：全部页面在构建期预渲染，未执行 JavaScript 也能完整阅读，水合后补齐交互。
- **阅读体验**：目录、阅读进度恢复、专注模式、代码高亮/折叠、KaTeX、Mermaid、图片预览。
- **全站深色唯一**：黑白强对比语义 Token，动效尊重 `prefers-reduced-motion`。
- **分发力**：OG/Twitter Card、JSON-LD、RSS、Sitemap、`llms.txt`、Service Worker 离线壳。
- **自动化**：评论反垃圾、友链申请/巡检/黑名单、外链扫描、飞书通知，全部由 GitHub Actions 驱动。

## 页面一览

| 路径 | 说明 |
| --- | --- |
| `/` | 小部件（Bento）个人主页：名片、访问统计、推荐阅读、写作档案、联系方式、热门标签、服务状态 |
| `/posts`、`/post/:id` | Markdown 文章，构建期校验 frontmatter；标签筛选，无 category |
| `/archive`、`/posts?tag=` | 归档时间线；标签筛选在文章列表页（独立 `/tags` 页已退役） |
| `/shuoshuo` | Giscus 公告 Discussion，每条评论 = 一条说说 |
| `/friends` | 友链展示（正常/失联分组）与申请入口 |
| `/guestbook` | Giscus 单讨论留言板，与文章评论共用反垃圾链路 |
| `/search`、`Ctrl/Cmd + K` | 构建期生成的搜索索引，命令面板与搜索页共用评分 |
| `/privacy` | 隐私政策（本地存储、统计、Giscus、第三方链接） |
| `/cover`、`/watermark` | 封面生成器（批量 ZIP）与图片水印，全部本地处理 |
| 侧栏底部 | 服务状态入口，跳转 Better Stack 自定义状态页（无独立路由） |

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 前端 | React 19、React Router 7、TypeScript |
| 构建 | Vite 6（客户端 + SSR 双构建）、构建期 SSG |
| 样式与动效 | Tailwind CSS、PostCSS、Framer Motion、View Transitions |
| 内容 | react-markdown、remark-gfm/math、rehype-highlight/katex、gray-matter、sharp |
| 安全 | DOMPurify（富文本净化）、undici（逐 IP SSRF 防护） |
| 部署 | Cloudflare Workers Static Assets + 小型 Worker（仅 `/api/status` 同源代理） |

## 快速开始

要求 Node.js >= 20、npm >= 10。

```bash
git clone https://github.com/ououduck/pldduck.git
cd pldduck
npm install
cp .env.example .env        # 可选；Windows 用 copy
npm run dev                 # http://localhost:3000
```

常用环境变量：`VITE_SITE_URL`（影响 canonical / OG / RSS / Sitemap）、`VITE_BASE_PATH`（子路径部署）、
`VITE_BETTERSTACK_STATUS_PAGE_URL`（覆盖状态页地址）。

提交前自查：

```bash
npm run check     # 数据生成 + 校验 + 类型检查
npm test          # 单元测试（Vitest）
npm run build     # 生产构建（含产物与 SEO 审计）
```

## 项目结构

```text
pldduck/
├── config/            # 站点/评论配置、routes.mjs（路由唯一数据源）、构建配置
├── posts/ friends/    # 文章 Markdown、友链 JSON（一站一文件）
├── generated/         # 构建产物：posts.json / friends.json / 搜索索引等
├── public/            # 静态资源、sw.js、离线页、生成的 feed / sitemap
├── scripts/           # 构建与自动化脚本，lib/ 为共享的安全、抓取与日志模块
├── worker/            # Cloudflare Worker：入口 + /api/status 逻辑
├── src/               # 页面、组件、services、hooks、utils、SSR 路由数据
├── ai-rules/          # 各模块约束清单（改动前必读）
├── .pages.yml         # Pages CMS 集合、字段与动作按钮
└── .github/workflows/ # 构建、部署、评论审核、友链/反链巡检、通知
```

`generated/`、`public/feed.xml` 与 Sitemap 都是构建产物，不要手工编辑。

## 配置

| 文件 | 内容 | Pages CMS 集合 |
| --- | --- | --- |
| `config/site.config.json` | 标题、SEO、logo、社交、作者、分区开关、状态页地址 | 站点配置 |
| `config/comments.config.json` | Giscus 评论、留言板、说说数据源 | 评论与留言板 |
| `config/friend-blacklist.json` | 友链黑名单（支持 `*.example.com` 泛域名） | 友链黑名单 |
| `friends/*.json` | 友链条目（名称、地址、头像、简介、失联开关） | 友链 |

两份站点配置在加载时合并为同一个 `siteConfig`，消费方无需感知拆分。

**服务状态三处配置分离**：公开跳转地址 `statusPageUrl`（站点配置）｜ Worker 变量
`BETTERSTACK_STATUS_PAGE_ID`（`wrangler.jsonc`）｜ Worker Secret `BETTERSTACK_API_TOKEN`
（`npx wrangler secret put`，绝不进仓库）。细节见 [ai-rules/site-status.md](ai-rules/site-status.md)。

## 构建与部署

`npm run build` 依次执行：数据生成 → OG 卡片 → 客户端构建 → SW 版本注入 → SSR 构建 →
模板快照 → SSG 预渲染 → 产物审计 → SEO 审计，任一阶段失败立即终止。

日常 push **不触发部署**，只跑 CI 门禁。部署方式二选一：

- Pages CMS 侧边栏点「部署到 Cloudflare Worker」；
- Actions 手动运行 `deploy.yml`，或本地：

```bash
npm ci && npm run build
npx --yes wrangler@4.123.0 deploy
```

GitHub Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`FEISHU_WEBHOOK_URL`、
`AKISMET_API_KEY`。`BETTERSTACK_API_TOKEN` 是 Cloudflare Worker Secret，不配在 GitHub。

## 友情链接

**申请流程**（全部公开可查）：

1. 在 `/friends` 展开「申请友链」，把本站挂到你的站点上（JS 渲染的挂件也能识别，服务端直出最稳）。
2. 填好资料点「生成 Issue 申请」，GitHub 中核对预填正文后提交。
3. 机器人检查表单、站点/头像可达性与反链（静态优先，必要时无头浏览器渲染）。
4. **全部通过自动收录**：写入 `friends/<slug>.json`、触发部署并关闭 Issue；未通过则只公示证据，
   等站长人工处理（打 `friend-approved` 标签即收录，机器人评论「人工审核已通过，已添加至友链页」并关闭）。

**黑名单**：`config/friend-blacklist.json`（Pages CMS 可编辑）命中的站点/反链页/头像会被直接拦截，
不进入人工审核；支持 `example.com`（含子域）与 `*.example.com`（仅子域）。

**持续巡检**：

| 任务 | 频率 | 说明 |
| --- | --- | --- |
| 失联巡检 | 每天 02:00 UTC | 两次探测都打不开 → 移入「已失联的博客」；恢复后自动移回 |
| 反链巡检 | 每天 03:00 UTC | 只读检查每条友链是否仍挂本站反链（渲染兜底），异常站点汇总推飞书 |

友链数据在 [`friends/`](https://github.com/ououduck/pldduck/tree/main/friends)，可在 GitHub 直接查阅。

## 自动化一览

| Workflow | 触发 | 作用 |
| --- | --- | --- |
| `ci.yml` | push / PR | 数据校验、类型检查、测试、构建与 SEO 审计 |
| `deploy.yml` | 手动 / CMS 按钮 | 构建并部署到 Cloudflare Worker |
| `friend-link.yml` | 友链 Issue 事件 | 申请检测、自动收录或转人工、黑名单拦截 |
| `friend-backlink-audit.yml` | 每日 / 手动 | 反链巡检（只读，结果推飞书） |
| `friend-availability-audit.yml` | 每日 / 手动 | 失联巡检，双向同步 `unavailable` |
| `comment-keyword-filter.yml` | 评论/讨论事件 | 关键词拦截（minimize/delete） |
| `comment-keyword-recheck.yml` | 手动 | 用当前关键词全量复查历史评论 |
| `akismet-discussion-comment-check.yml` | 评论事件 | Akismet 垃圾评论识别 |
| `check-broken-links.yml` | 手动 | 扫描文章外链失效情况并推飞书 |
| `notify-post-update.yml` | 文章更新 | 向订阅 Issue 推送新文章通知 |
| `feishu-webhook.yml` | push / 评论 / workflow 完成 | 飞书机器人通知 |

## 文档

改动代码前请先读 [AGENT.md](AGENT.md) 与 [ai-rules/](ai-rules/README.md)：按模块记录了构建契约、
安全边界与踩过的坑，不是风格建议。反馈与其他问题请邮件联系 <pldduck@outlook.com>。

## 许可

源代码与仓库内内容以 [MIT](./LICENSE) 许可发布。
