# CI/CD Workflows — AI 修改规则

## 功能概述

GitHub Actions 自动化：ci（push/PR 全量门禁）、deploy（手动部署到 Cloudflare Worker：Workers Static Assets + 小型 Worker 运行时，仅 `GET /api/status` 同源代理 Better Stack）、feishu-webhook、comment 三件套、akismet、notify-post-update、check-broken-links、friend-link（友链反链检测：静态抓取为主、未命中用 Playwright/Chromium 渲染兜底；人工放行后写文件并触发部署）、friend-availability-audit（每日友链失联巡检，双向同步 `unavailable`）；PagesCMS 动作按钮（.pages.yml）。

## 关键文件

- `.github/workflows/*.yml`（10 个）
- `.pages.yml`（CMS 集合/字段/动作按钮）

## 修改规则（必须遵守）

1. **权限最小化**：每个 workflow 只声明所需 scope（contents/discussions 等），禁止 id-token 滥用与写权限冗余。
2. **并发与超时**：所有 workflow 保持 concurrency 策略（串行/取消语义按事件类型合理选择）与 timeout-minutes。
3. **secrets 最小传递**：只传给需要的步骤；日志不得输出 secrets（GitHub 会脱敏 CI 侧，本地运行无保护）。
4. **构建同源**：deploy 与 ci 必须共用 `npm run build` 同一流程，禁止双套构建。
5. **白名单同步**：新增 workflow 必须同步 feishu-webhook.yml 的 workflow_run 白名单
   （`scripts/workflows-config.test.mjs` 会钉住白名单覆盖、`.pages.yml` 指向与本文件计数，漂移即红）。
6. **版本固定**：第三方 action 用 major tag（checkout@v5 等）；CLI 工具（wrangler）用精确版本（部署可复现）。
7. **PagesCMS 字段白名单**：.pages.yml 的 siteConfig / portalConfig / commentsConfig fields 必须覆盖各自配置文件实际使用的全部键（缺字段 CMS 保存会丢数据）。
8. **CI 门禁**：check/test/build 三 job 的职责边界保持（类型+内容校验 / 单测 / 构建+审计）。
9. **部署目标名固定为 `pldduck`**（Cloudflare Worker 名称，见 `wrangler.jsonc`）：`d-blog` 已被旧站
   的迁移跳转页占用，复用会让新站与跳转页互相覆盖，等于把线上博客换成公告页。
10. **`workflow_dispatch` 的 payload 是不可信输入**：它是调用方自备的 JSON，取值必须校验
    `repository.ref` 为 main（部署只允许 main）；且一律经 `env:` 间接引用，**不得把
    `${{ }}` 直接插进 `run:` 脚本**——那是 Actions 命令注入的常规入口。
11. **外部内容不得进入 shell**：Issue/评论/PR 正文、标题、分支名等一律经 `env:` 传给
    `run:`（或只交给 `node` 脚本处理），**禁止 `${{ }}` 内插进 `run:`**。自触发守卫
    （`sender.type != 'Bot'`、机器人正文标记、`author_association` 白名单）防的是机器人
    自己喂事件给自己 —— 评论重测与 `labeled` 入口都必须带，否则一次运行会级联出自循环。
12. **写权限必须配「窄写入面」，两道写入道各自有护栏**：
    - **A 道（站点内容写入）**：写入触发器只有两个 —— 友链自动检测**全部通过**（表单校验 + 站点/头像
      可达 + 反链命中，2026-11 用户授权），或仓库成员手动打 `friend-approved` 标签；两者共用
      `publishRecord` 与同一套护栏（写前校验、目录硬编码、单次单文件、sha 乐观锁、写后回读）。
      **没通过一律只出证据、Issue 保持开启**，不自动拒绝、不自动关闭。
    - **B 道（定时数据维护）**：唯一获准的自动写入是 `friend-availability-audit` 改 `friends/*.json`
      的 `unavailable` **单个键**（2026-10 用户明确授权，含覆盖站长手工勾选；护栏见 ai-rules/friends.md）。
      自动判定要写数据必须同时具备：只改一个已知键、单轮标记上限、失败复测、全局熔断
      （判定异常时只报告不写）、受限结果冻结不动、写入点按固定文件名定位。缺任一条即改成人工触发。
    - 两道共同：文件名不由正文派生、单次只改一个文件、sha 乐观锁、只扩 permissions 的声明范围。
      job 级 permissions 只能收窄不能扩权，故 workflow 级必须声明到实际最大值
      （后人「优化」成 read 会静默失去写入能力）。
13. **部署形态固定为 Worker + Static Assets**：`wrangler.jsonc` 必须保持 `main: ./worker/index.mjs`、
    `assets.directory: ./dist`，且 `assets.run_worker_first` 只匹配 `/api/*` —— 静态资源继续由 Static
    Assets 直出（不消耗 Worker 请求、平台额度耗尽时页面仍可用），**不得**改成 `true` 或把全站路由进
    Worker。入口 `worker/index.mjs` 只能 `export default { fetch }`，业务逻辑与可测试具名导出放
    `worker/status.mjs`（具名导出写进入口会让 Workers 启动失败）。凭据与变量分离：
    `BETTERSTACK_API_TOKEN` 只能是 Cloudflare Worker Secret（一次性执行
    `npx wrangler secret put BETTERSTACK_API_TOKEN`，**不是 GitHub Secret**，CI 不读取也不需要）；
    `BETTERSTACK_STATUS_PAGE_ID` 写 `wrangler.jsonc` 的 `vars`（非敏感）。wrangler 精确版本固定为
    `4.123.0`（见 `deploy.yml`，不得改成浮动 tag）；`compatibility_date` 必须与固定版本内置 workerd
    支持上限对齐（当前 `2026-08-18`），否则本地 `wrangler dev` 无法启动，升级 wrangler 时一并评估。

## 常见陷阱

- workflow 名称（name:）是 feishu-webhook 白名单与 .pages.yml 动作的匹配键，改名需三处同步；`deploy.yml` 的 `Deploy to Cloudflare Worker` 即三处之一。
- concurrency group 名跨 workflow 同值时互相串行（评论双过滤器的既有行为）。
- **GITHUB_TOKEN 的 push 不触发任何 workflow**（GitHub 防自循环）：机器人提交文件后 `ci.yml`
  与 `push: main` 的通知都不会跑，所以校验必须在写入前完成、通知必须由写入方自己发；
  但 `workflow_dispatch` 可以被 GITHUB_TOKEN 调用（需 `actions: write`，2022-09 起官方支持）。
- 部署目标别再退回「只配静态资产」：当前是 Worker + Static Assets，`worker/index.mjs`
  只处理 `/api/*`；`run_worker_first` 一旦放宽，静态资源会开始消耗 Worker 请求额度，平台限流
  （1027）时整站受影响。状态接口失败时由前端兜底为中性「服务状态」，不得把它当作部署失败。
- `BETTERSTACK_API_TOKEN` 不是 GitHub Secret：写进仓库 Secrets 不会被 Worker 读取（Worker 只读
  自身 Secret），而 `npx wrangler secret put` 设置的 Worker Secret 也不需要进 CI。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
