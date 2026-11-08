# pldduck · 跑路的duck

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)
![React](https://img.shields.io/badge/react-19-61dafb.svg)
![Vite](https://img.shields.io/badge/vite-6-646cff.svg)
![CI](https://github.com/ououduck/pldduck/actions/workflows/ci.yml/badge.svg)

个人站点「跑路的duck」的完整源码：全站 HTML 于构建期直出，客户端以 SPA 水合运行。

**在线地址**：<https://www.pldduck.com> ｜ **联系邮箱**：<pldduck@outlook.com>

</div>

## 关于本站

站点基于 React 19 + Vite 6 + TypeScript 构建，预渲染（SSG）与客户端水合并行：正文在未执行 JavaScript
的情况下依然可读，交互能力在水合后补齐。首页是极简个人主页 + 全站搜索 + 联系方式/订阅入口，
其余内容与工具拆在同一域下的子路径：

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 首页（个人主页） | `/` | 站主身份（头像/名字/介绍）、全站搜索表单、联系方式（GitHub / 邮箱 / QQ 一键复制 / RSS / 更新订阅 / 项目仓库）与「看看文章」CTA（桌面卡片 + 最新两篇标题，移动端 pill），无门户入口与内容列表 |
| 文章 | `/posts`、`/post/:id` | Markdown 驱动，构建期校验 frontmatter、分类白名单并过滤草稿 |
| 归档 / 标签 | `/archive`、`/posts?tag=` | 归档由构建期生成的站点数据派生；标签筛选在文章列表右侧标签卡（移动端标签弹窗），独立 `/tags` 页已退役 |
| 说说 | `/shuoshuo` | 公告 Discussion 每条评论 = 一条说说，Giscus 内嵌，最新在前（旧 `/shuoshuo/:id` 301 回列表页）；评论与文章/留言板共用 Akismet + 关键词审核链路 |
| 友情链接 | `/friends` | 可申请交换，含自动检测与人工审核流程（见「友链交换」） |
| 留言板 | `/guestbook` | Giscus 单讨论模式，与文章评论共用同一条反垃圾链路 |
| 站内搜索 | `/search`、`Ctrl/Cmd + K` | 构建期生成索引，命令面板与独立搜索页共用同一套多维权重评分 |
| 封面生成器 | `/cover` | 配图裁切与文字排版，支持批量导出 ZIP |
| 水印工具 | `/watermark` | 图片处理全部在浏览器本地完成，原图不上传 |
| 服务状态（侧栏底部） | 无独立路由 | 跳转 Better Stack 自定义状态页；四种真实状态 + 中性兜底「服务状态」，失败也可点击 |

阅读体验方面提供目录导航、阅读进度恢复、专注阅读模式、代码高亮与折叠、KaTeX 公式、Mermaid 图表、
图片预览、全站深色唯一（黑白强对比：近黑底 / 近白字，`<html class="dark">` 由模板固定）、侧边栏图标条
（鼠标移入展开为浮层）以及 Service Worker 离线壳；同时输出 OG/Twitter Card、JSON-LD、RSS
（`/feed.xml`）、Sitemap 与 `llms.txt`。所有动效均尊重 `prefers-reduced-motion`。

移动端首页（<768px）去掉 Hero 卡片、内容铺满可用视口并禁止上下滚动（CSS `:has(.home-page)` 只在首页
生效，离开后自动恢复），头像 80px、标题 2.1rem、联系方式为 2 列紧凑网格；桌面（≥768px）仍是 Hero
大色块卡片。首页底部是「看看文章」CTA：移动端为与搜索框同款的 pill 按钮，桌面为独立卡片并列出
「最新发布」两篇文章标题（构建期数据按 `updatedAt/date` 降序，不动态请求）。

全站页面不再渲染底部 Footer：版权信息只保留在侧栏底部，侧栏顺序固定为 导航清单 → 服务状态入口 →
版权（版权在最底）。侧栏分组只剩「主页 / 栏目 / 工具」，联系方式与订阅入口统一放在首页；
侧栏是 `fillHeight` 固定布局，只有中间的导航清单滚动，服务状态入口与版权始终可见。

视觉上全站使用黑白强对比的语义设计 Token（`src/index.css` 的 CSS 变量 + `config/tailwind.config.js`
的映射，覆盖颜色、字体、间距、圆角与动效；全站深色唯一，`:root` 直接给深色值），文章列表采用横向
横幅条目 + 右侧标签卡（移动端标签弹窗、继续阅读卡片），不再是重卡片网格；搜索页结果也统一为单列横幅。

文章详情页采用编辑式版式：标题区左对齐并与正文同轴（46rem 列宽），移动端封面先于标题/署名（28px 标题）、
桌面标题/署名先于封面；移动端署名作者单独一行、日期/时长/阅读量在下一行，桌面恢复单行。h2 只用一条
发丝线分节，文末按许可/作者/订阅/系列/相邻/相关/评论轻量收尾；专注阅读模式把正文放大到 19px、列宽收窄到 44rem。

归档、标签与搜索页沿用同一套编辑式版式：衬线标题 + 右侧统计；标签筛选移到文章列表
（桌面右侧标签卡 / 移动端标签弹窗，`?tag=` 过滤），独立标签页已退役；搜索范围是文字 tab，结果统一
单列横幅。文章详情页的阅读控制台也已减负：桌面 44px 目录按钮 + 小浮层（再次点击同一按钮可收起，
图标双层常驻保证点击稳定），移动端只保留目录/进度/分享/专注阅读四个高频入口。
友链、说说、留言板、404 与工具页同样去掉英文大写眉题，统一为衬线标题轻页头；归档时间线与友链页
整体改为 1/2/3 列大色块卡片，说说页页头与评论区也改为 surface 卡片。

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
| 部署与边缘 | Cloudflare Workers Static Assets（静态资源直出）+ 小型 Worker 运行时（仅 `GET /api/status` 同源代理 Better Stack） |

## 快速开始

环境要求：Node.js >= 20，npm >= 10。

```bash
git clone https://github.com/ououduck/pldduck.git
cd pldduck
npm install
cp .env.example .env          # 可选：覆盖站点 URL、子路径与状态页地址（Windows 使用 copy）
npm run dev                   # 本地开发，默认 http://localhost:3000
```

`.env` 中常用变量的作用：`VITE_SITE_URL` 为站点公开地址（影响 canonical、OG、RSS、Sitemap），
`VITE_BASE_PATH` 仅在子路径部署时需要，`VITE_BETTERSTACK_STATUS_PAGE_URL` 可选，用于覆盖
`config/site.config.json` 里的状态页地址（只接受 https）。

Vite 本地开发没有 Worker 运行时：侧栏底部的服务状态入口会固定显示中性「服务状态」，这是预期的
兜底行为。需要联调 `/api/status` 时，先 `npm run build`，在 `.dev.vars`（已 gitignore）中配置
`BETTERSTACK_API_TOKEN` / `BETTERSTACK_STATUS_PAGE_ID`，再运行
`npx --yes wrangler@4.123.0 dev`（由 Wrangler 同时提供 Worker 与 `dist/` 静态资源）。

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
├── posts/ friends/            # 文章 Markdown、友链 JSON（每项一个文件）；说说改由 giscus 承载，无本地目录
├── generated/                 # 构建产物：posts.json / posts-search.json / friends.json 等
├── public/                    # favicon、PWA 图标、sw.js、offline.html 与生成的 feed / sitemap
├── scripts/                   # 构建与自动化脚本，lib/ 为共享的 HTTP 安全与日志模块
├── worker/                    # Cloudflare Worker 运行时：index.mjs 为入口（只允许 default fetch），
│                              # status.mjs 为 /api/status 同源代理逻辑（静态资源不经 Worker）
├── src/
│   ├── components/            # Layout、SiteSidebar、Seo、TableOfContents、ImageViewer 等
│   ├── pages/                 # 页面组件（懒加载）；cover/、watermark/ 为各自模块集
│   ├── services/              # posts / friends / readingHistory 等数据访问（说说走 giscus 内嵌，无 service）
│   ├── hooks/ utils/          # 自定义 Hook 与工具函数；utils 下 *.mjs 为客户端与构建脚本共享逻辑
│   ├── ssr/routeData.tsx      # SSG 路由数据构造与客户端读取
│   └── App.tsx / index.tsx    # 路由与渲染入口
├── ai-rules/                  # 各功能模块的约束清单（改动前必读）
├── .pages.yml                 # PagesCMS 配置（后台编辑内容）
└── .github/workflows/         # 部署、评论审核、友链检测与失联巡检、更新通知、外链扫描
```

`generated/`、`public/feed.xml` 与 Sitemap 均为构建产物，不应手工编辑。

## 配置

站点配置按用途拆成三份，加载时合并为同一个 `siteConfig` 对象（消费方无需感知拆分）：

| 文件 | 内容 | PagesCMS 集合 |
| --- | --- | --- |
| `config/site.config.json` | 标题、描述、SEO、logo、社交、作者、内容开关、服务状态页地址 | 站点配置 |
| `config/portal.config.json` | 历史门户配置：标语、状态、标签、入口、链接、项目；首页已不再消费（暂保留） | 首页内容 |
| `config/comments.config.json` | Giscus 评论与留言板参数 | 评论与留言板 |

### 服务状态相关配置

| 配置项 | 位置 | 用途 / 可见性 |
| --- | --- | --- |
| `statusPageUrl` | `config/site.config.json`（PagesCMS「站点配置」） | 公开；状态入口跳转地址，只接受 https 绝对地址 |
| `VITE_BETTERSTACK_STATUS_PAGE_URL` | `.env`（构建期） | 公开；优先于 `statusPageUrl`，同样只接受 https |
| `BETTERSTACK_STATUS_PAGE_ID` | `wrangler.jsonc` 的 `vars` | Worker 运行时非敏感变量；本地在 `.dev.vars` 覆盖 |
| `BETTERSTACK_API_TOKEN` | Cloudflare Worker Secret | 仅 Worker 可读；用 `npx wrangler secret put` 设置，绝不进仓库/前端产物 |

`statusPageUrl` 当前配置为站长提供的实际 Better Stack 自定义状态页地址
`https://status.pldduck.com`。

另有 `config/content.config.json`（`postCategories` 分类白名单）与 `config/routes.mjs`（路由清单，
预加载 / SSG / sitemap / 离线兜底全部由此派生）。

## 构建流程

`npm run build` 依次执行 9 个阶段：数据生成 → OG 卡片 → 客户端构建 → Service Worker 版本注入
→ SSR 构建 → 模板快照 → SSG 预渲染 → 产物审计 → SEO 审计，任一阶段失败立即终止。
Worker 不在构建阶段内：`worker/index.mjs`（入口）与 `worker/status.mjs`（`/api/status` 逻辑）由
`npx wrangler deploy` 在部署时按 `wrangler.jsonc` 打包上传。入口模块只允许 `export default { fetch }`，
具名导出常量/普通函数会被 Workers 运行时当成 handler 并报 `Incorrect type for map entry`（本地
`wrangler dev` 已实测），业务逻辑必须放在 `status.mjs`。

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

## 部署

采用 **GitHub Actions 构建 + Cloudflare Workers Static Assets 直传 + 小型 Worker 运行时**：
全站构建产物由 Static Assets 直接服务，只有 `GET /api/status`（Better Stack 状态页同源代理）
由 `worker/index.mjs` 处理。日常 push 不触发部署，仅手动触发：在 Pages CMS 侧边栏点击
「部署到 Cloudflare Worker」，或在 Actions 中手动运行 `deploy.yml`（payload 最小可用
`{"repository":{"ref":"main"}}`）。

### 一次性配置（Cloudflare 侧）

1. 在 `wrangler.jsonc` 的 `vars.BETTERSTACK_STATUS_PAGE_ID` 填入 Better Stack Status Page ID
   （非敏感；留空时接口返回 `unavailable`，不会伪造状态）。
2. 设置 Worker Secret（只做一次，不写入仓库）：
   ```bash
   npx --yes wrangler@4.123.0 secret put BETTERSTACK_API_TOKEN
   ```
   本地执行前需要环境变量 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`（权限与 CI 相同），
   或先 `npx wrangler login`；若 `pldduck` Worker 尚未创建，先执行一次下方部署命令再运行本命令。
3. 如不使用 `config/site.config.json` 的 `statusPageUrl`，可在构建环境设置公开变量
   `VITE_BETTERSTACK_STATUS_PAGE_URL`（只接受 https）。

### 部署命令

CI（`.github/workflows/deploy.yml`）实际执行的就是构建 + `wrangler deploy`；本地复现用：

```bash
npm ci
npm run build
npx --yes wrangler@4.123.0 deploy
```

wrangler 版本固定为 `4.123.0`（浮动 tag 会让部署行为不可复现）。`wrangler.jsonc` 的
`compatibility_date` 同步对齐到该版本内置 workerd 支持的上限（当前 `2026-08-18`），否则本地
`wrangler dev` 会拒绝启动；升级 wrangler 时再一起上调。部署完成后，`dist/` 由 Static Assets 直出，
`worker/index.mjs` 只拦截 `run_worker_first` 匹配的 `/api/*`。

Worker 已开启 **Workers Observability / Workers Logs**（`wrangler.jsonc` 的 `observability`）：
排障时在 Cloudflare Dashboard → Workers & Pages → `pldduck` → Logs 查看，或本地执行
`npx --yes wrangler@4.123.0 tail pldduck`。日志只输出通用错误信息，不包含 Token、`Authorization`
或上游响应体。

### GitHub Secrets

仓库需要配置：`CLOUDFLARE_API_TOKEN`（Workers Scripts:Edit 权限）、`CLOUDFLARE_ACCOUNT_ID`、
`FEISHU_WEBHOOK_URL`、`AKISMET_API_KEY`。

**`BETTERSTACK_API_TOKEN` 不是 GitHub Secret**：它是 Cloudflare Worker 运行时 Secret，按上面
「一次性配置」第 2 步设置，CI 不读取也不需要。Worker 名称为 `pldduck`（见 `wrangler.jsonc`）；
`d-blog` 是旧博客迁移跳转页所用的独立 Worker，两者不可复用。

平台一次性配置、CI 门禁、Service Worker 缓存策略、飞书通知与外链扫描的既有约束，分别记在
`ai-rules/` 的对应模块（ci-cd.md、site-status.md、service-worker.md、feishu-webhook.md、broken-links.md）。

## 服务状态与兜底

侧栏（桌面左栏与移动抽屉底部）常驻「服务状态」入口，没有独立路由：整块外链到 Better Stack
自定义状态页，状态值来自同源 `GET /api/status`。`statusPageUrl` 当前配置为站长提供的实际自定义域
`https://status.pldduck.com`。

### 状态与文案

| API 值 | 入口文案 | 视觉 |
| --- | --- | --- |
| `operational` | 所有服务正常 | 绿色对勾（唯一绿色成功态） |
| `degraded` | 部分服务异常 | 琥珀色警告 |
| `downtime` | 服务中断 | 红色故障 |
| `maintenance` | 服务维护中 | 天蓝色维护 |
| `unavailable`（兜底） | 服务状态 | 中性灰虚线（不对正常/故障做判断） |

### 取值与兜底链

- SSR/SSG 首帧与客户端水合首帧都固定渲染 `unavailable`（「服务状态」），拿到 `operational` 之前
  绝不会出现绿色勾选。
- 只有 `success === true` 且 `status` 属于四种真实状态才算成功；未知值、缺字段、非 JSON、坏 JSON、
  非 2xx（含 Cloudflare 1027、429）、网络断开、请求超时一律回退 `unavailable`。
- 前端单次请求 8 秒超时（`STATUS_REQUEST_TIMEOUT_MS`），不重试；失败不隐藏、不禁用入口，
  状态页地址始终可点（`target="_blank"` + `rel="noopener noreferrer"`）。
- 轮询统一由全站唯一的 `src/services/siteStatusStore.ts` 负责：订阅者立即拿到当前快照，之后每
  60 秒刷新一次，标签页重新可见时补刷一次；桌面侧栏与移动抽屉同时挂载时只发一个请求
  （服务层 in-flight 去重），不做客户端结果缓存；最后一个订阅者取消后清理 interval 与
  visibility 监听，SSR/模块导入阶段不访问 `window`/`document`。

### Workers 每日上限提示

- 状态请求返回 HTTP **1027**（Cloudflare 平台级拦截/限流）或 **429** 时，除把侧栏入口回退为
  「服务状态」外，还会在页面顶部弹出一次红色感叹号提示；文案固定为
  「今日 Workers 请求次数达到上限，部分功能受限」，3 秒后自动收回、无关闭按钮。
- 检测与节流都在 `siteStatusStore` 内完成：**同一标签页 10 分钟内最多提示一次**
  （`sessionStorage` 记录上次提示时间，存储不可用时回退模块级时间戳）；
  `src/components/WorkersLimitToast.tsx` 只订阅事件、不自行请求状态，挂在 `AppShell` 内，
  因此所有页面、阅读模式与手机端都能收到提示。
- 其他失败（500、网络断开、坏 JSON、超时等）**不会**触发该提示，避免把普通故障误报成额度用完。

### Worker 缓存与请求频率

- `worker/index.mjs`（入口）+ `worker/status.mjs`（逻辑）只处理 `GET /api/status`；成功结果写入 Cloudflare Cache API 60 秒
  （`STATUS_CACHE_TTL_SECONDS`），同一状态页 ID 的重复请求命中缓存不回源；失败结果绝不写缓存。
- 上游 Better Stack 请求 5 秒超时且只尝试一次；Token 或状态页 ID 缺失时直接返回 `unavailable`，
  不发上游请求。
- 对外响应 `Cache-Control: no-store`（浏览器/CDN 不缓存），`X-Status-Cache: HIT/MISS` 仅用于调试。
- 正常情况下前端每 60 秒一拍；同一缓存作用域内对同一状态页 ID 每 60 秒最多回源一次，
  多访客并发由 Cache API 摊平。

### Cloudflare 免费额度耗尽时

- `assets.run_worker_first` 只匹配 `/api/*`：HTML、JS、CSS、图片等静态资源由 Static Assets 直接
  返回，不调用 Worker、不消耗 Worker 请求额度。因此即使 Worker 请求额度耗尽（平台返回 1027 等），
  页面本身仍能正常加载，状态入口回退为中性「服务状态」，并且仍可点击跳转状态页。
- 这是有意的降级设计：状态展示永远不是页面可用的前置条件。
- 边界：如果整个 Worker + Static Assets 部署被平台拒绝执行（账户级限制、整个部署被禁用等），
  静态资源与 Worker 都不再提供，前端无法绕过——只能恢复平台侧服务。

## 友链交换

本站开放友情链接，流程全部公开可查：

1. 打开 <https://www.pldduck.com/friends>，展开「申请友链」，按面板内信息把本站挂到你的站点上。
   **链接必须是服务端直出的 `<a href>`**——Vue / React 用 JavaScript 渲染的友链挂件，静态抓取看不到。
2. 在「填好资料，一键带到 Issue」卡片里填写站点名称、地址、简介、头像（反链页面选填），勾选三项确认，
   点「生成 Issue 申请」——会打开一个正文已经填好的 GitHub 新建 Issue 页面，核对无误后提交即可；
   也可以点「改用空白 Issue 表单」，按模板逐项填写。
3. GitHub Actions 会先探测你的站点与头像在境外能否访问（开启「禁海外」会被判定为不可达并自动关闭 Issue，
   解除屏蔽后重开 Issue 即可重新检测），随后静态抓取反链页面并公示检测证据。
4. **检测结果只作为审核参考，是否收录由站长确认。** 站长按「收录」标签后，机器人生成 `friends/<slug>.json`
   并自动触发部署；按「拒绝」标签则回复固定文案并关闭 Issue。
5. 申请只用于**新增收录**：已收录条目如需修改名称、地址、简介或头像，或想把友链下架，请直接邮件联系 <pldduck@outlook.com>（不走 Issue 流程，重复提交同一站点会被判已收录）。
6. 条目生效需要等待那次部署跑完，提交后不会立即出现在友链页。

收录之后由机器人持续巡检：每天 02:00 UTC（北京时间 10:00）探测各站点可达性，两次都打不开的自动
归入「已失联的博客」，恢复访问的自动移回上方列表；被反爬/防盗链拦下（401/403/429 等）只记录不动开关。
单次最多标记 3 个，若过半站点同时判为不可达则视为本站出口故障、整轮只报告不改动。也可在 Pages CMS
侧边栏点「友链失联审核」立即执行一次（先在 Actions 里勾 `dry_run` 看清单更稳）。

友链数据以「一站一文件」的形式存放在 [`friends/`](https://github.com/ououduck/pldduck/tree/main/friends)，
可在 GitHub 上直接查阅。

## 验证方式

以下只是自检/复核方式，不代表当前仓库已通过全部门禁，也不声称线上状态页已验证可访问：

| 目标 | 命令 / 操作 |
| --- | --- |
| 状态链路单测 | `npx vitest run worker/index.test.mjs src/services/siteStatus.test.ts src/services/siteStatusStore.test.ts src/services/siteStatusStore.ssr.test.ts src/components/SiteStatusBadge.test.tsx src/components/WorkersLimitToast.test.tsx` |
| 首页与外壳单测 | `npx vitest run src/pages/Home.test.tsx src/components/Layout.test.tsx` |
| 配置与 workflow 契约 | `npx vitest run scripts/workflows-config.test.mjs scripts/pagescms-config.test.mjs` |
| Worker 配置 / 打包校验 | `npx --yes wrangler@4.123.0 deploy --dry-run`（不实际部署） |
| 全量门禁 | `npm run check`、`npx eslint .`、`npm test`、`npm run build`、`npm run audit:seo` |
| 本地联调 `/api/status` | 先 `npm run build`，在 `.dev.vars` 配好 Token 与状态页 ID，再 `npx --yes wrangler@4.123.0 dev`，访问 `/api/status` 检查 JSON 与 `X-Status-Cache` |
| 线上核对 | 部署后在浏览器确认侧栏入口文案与 60 秒刷新；实际状态页地址需按 Better Stack 自定义域核对 |

## 反馈与协作

本站为个人站点，内容以站长笔述为准。仓库关闭了空白 Issue，Issues 只保留「友链申请」这一条流程：

- **交换友链**：在 `/friends` 页填好资料后生成 Issue 申请（流程见上文）。
- **其他问题**：邮件联系 <pldduck@outlook.com>。

改动代码前请先阅读 [AGENT.md](AGENT.md) 与 [ai-rules/](ai-rules/README.md)：其中记录的是各模块的
既有约束与踩过的坑（构建契约、检测口径、安全边界），并非风格建议。

## 文档

本仓库不设独立文档目录：约束与流程都记在 [AGENT.md](AGENT.md) 与 [ai-rules/](ai-rules/README.md) 里，
按模块分册（文章与内容校验、评论与留言板、友链、说说、服务状态、部署与各 workflow）。改任何功能前先读对应的
那一份，改完同步它 —— 这些文件写的是既有契约与踩过的坑，不是风格建议。

## 许可

源代码与仓库内内容以 [MIT](./LICENSE) 许可发布。
