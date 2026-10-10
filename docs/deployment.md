# 部署与自动化

## 部署模型

**GitHub Actions 构建 + 双平台直传**：构建在 GitHub 完成（公开仓库 Actions 免费额度），产物直传
Cloudflare Pages 与 EdgeOne Pages。日常 push 不触发部署，**只手动触发**：

1. Pages CMS 侧边栏「🚀 部署到 Cloudflare & EdgeOne」按钮（配置见 `.pages.yml`）；
2. GitHub Actions 手动 Run workflow（`deploy.yml`，payload 最小可用 `{"repository":{"ref":"main"}}`）。

`deploy.yml` 会跑完整 `npm run build` 流水线（含产物与 SEO 审计），任一阶段失败即不上传。

### 一次性前置配置

| 项               | 说明                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Pages | 项目类型 **Direct Upload**（直传），自定义域名与缓存策略（`public/_headers`）已就位                                              |
| EdgeOne Pages    | 项目类型 **直传**，域名 CNAME 已切换，缓存规则需在控制台手动配置                                                                 |
| 仓库 Secrets     | `CLOUDFLARE_API_TOKEN`（Pages:Edit 权限）、`CLOUDFLARE_ACCOUNT_ID`、`EDGEONE_API_TOKEN`、`FEISHU_WEBHOOK_URL`、`AKISMET_API_KEY` |

两个平台的项目名均为 `pldduck`（已在 `deploy.yml` 配置，不一致时修改 `--project-name` / `-n`）。
**不要改回 `d-blog`**：那个名字属于旧博客（`ououduck/D-blog-old`）的迁移跳转页，
复用会让新站与跳转页互相覆盖。

### 其他平台

产物是全站预渲染的静态目录，但 SPA 路由仍需要 fallback（未知路径回退到 `index.html`）：

- Vercel（`vercel.json`）：`{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`
- Netlify（`netlify.toml`）：`[[redirects]] from="/*" to="/index.html" status=200`
- Nginx：`try_files $uri $uri/ /index.html;`

## Service Worker

作用域跟随部署路径，在线时按页面 / 静态资源 / 图片分别缓存；断网时优先页面缓存，
SPA 路由未命中则启动应用壳并从 IndexedDB 渲染已保存正文。可离线兜底的首段集合由
`config/routes.mjs` 派生，构建期写入 `public/sw.js` 的标记区（见
[ai-rules/service-worker.md](../ai-rules/service-worker.md)）。

## CI

`ci.yml` 在每次 push / PR 上执行：类型检查 → ESLint → 单元测试 → 完整构建 → 产物审计 + SEO 审计。
husky 的 pre-commit 另跑 lint-staged（ESLint --fix + Prettier）与 `npm run typecheck`。

## 飞书通知

仓库事件通过 [`feishu-webhook.yml`](../.github/workflows/feishu-webhook.yml) 实时推送到飞书机器人
Webhook：新评论 / 新讨论 / 新 Issue、push 到 main 的提交、任一 Action 运行结果（成功/失败/取消，
通知自身的结果被跳过）。

**一次性配置**：在仓库 **Settings → Secrets and variables → Actions** 添加 `FEISHU_WEBHOOK_URL`
（接收端地址，支持路径或查询串密钥）。通知默认使用带颜色标题、分组正文和可点击链接的飞书交互式
卡片；如需兼容旧版机器人，可配置仓库变量 `FEISHU_MESSAGE_FORMAT=text` 回退为纯文本。
未配置 Webhook 时 workflow 优雅跳过（`::warning::` 正常退出，不红叉）。

其他独立 workflow：评论 Akismet 反垃圾（`akismet-discussion-comment-check.yml`）、关键词过滤
（`comment-keyword-filter.yml` / `comment-keyword-recheck.yml`）、文章更新订阅通知
（`notify-post-update.yml`）。**新增 workflow 必须同步 `feishu-webhook.yml` 的白名单**，否则该
workflow 的运行结果不会通知。

## 文章外链失效扫描

博客内容会随外部站点改版/下线产生死链，且完全可以在构建期检测。`scripts/check-broken-links.mjs`
扫描 `posts/*.md` 中全部 http/https 外链（Markdown 链接 + HTML `<a href>`，排除图片与站内锚点），
逐个请求检查可达性，失效链接按文章分组汇总（带行号与 HTTP 状态）推送到飞书机器人 Webhook。
检测在 GitHub Actions 本地完成，不依赖第三方链接检测 API；服务器已响应但限制自动化访问的
401/403/405/406/407/429 会标记为「可达但受限」，只记录提示，不误报为死链。只读操作，
不修改仓库、不触发部署。

- **触发**：Pages CMS 侧边栏「🔗 检查失效外链」按钮（`check-broken-links.yml`，workflow_dispatch），
  或每周一 02:00 UTC 定时自动巡检（schedule）；
- **本地运行**：`npm run check:links`（默认仅报告，退出码 0）；`--dry-run` 只打印不上报；
  `--fail` 发现失效链接时非零退出（可用于 CI 红叉门禁）；`--ignore-hosts=a.com,b.com` 跳过指定域名
  （用于已知反爬/机器人拦截的站点，如 Cloudflare Dashboard 对非浏览器 GET 返回 403 属误报，
  CI 中已内置该域名）；
- **本地 TUN 代理**：开着 Clash/Surge 等 TUN 代理时，DNS 会把全部域名解析到 198.18.0.0/15 fake-IP
  段，脚本会自动识别（日志提示 `Detected local TUN proxy`）并跳过 IP 级 SSRF 校验、经代理转发请求，
  不会误报死链；如需强制禁用自动识别可设 `ALLOW_PROXY_ARTIFACT_DNS=0`；
- **通知配置**：复用飞书机器人 Webhook Secret（`FEISHU_WEBHOOK_URL`），未配置时优雅跳过；
  报告发送复用 `scripts/lib/feishu-webhook.mjs`。
