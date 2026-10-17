# CI/CD Workflows — AI 修改规则

## 功能概述

GitHub Actions 自动化：ci（push/PR 全量门禁）、deploy（手动部署到 Cloudflare Worker）、feishu-webhook、comment 三件套、akismet、notify-post-update、check-broken-links、friend-link（友链反链检测 + 人工放行后写文件并触发部署）；PagesCMS 动作按钮（.pages.yml）。

## 关键文件

- `.github/workflows/*.yml`（9 个）
- `.pages.yml`（CMS 集合/字段/动作按钮）

## 修改规则（必须遵守）

1. **权限最小化**：每个 workflow 只声明所需 scope（contents/discussions 等），禁止 id-token 滥用与写权限冗余。
2. **并发与超时**：所有 workflow 保持 concurrency 策略（串行/取消语义按事件类型合理选择）与 timeout-minutes。
3. **secrets 最小传递**：只传给需要的步骤；日志不得输出 secrets（GitHub 会脱敏 CI 侧，本地运行无保护）。
4. **构建同源**：deploy 与 ci 必须共用 `npm run build` 同一流程，禁止双套构建。
5. **白名单同步**：新增 workflow 必须同步 feishu-webhook.yml 的 workflow_run 白名单。
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
12. **写权限必须配「人工确认 + 窄写入面」**：授予 `contents: write` 的 workflow 不得把
    「自动检测结果」当作写入条件（判定只出证据），写入必须由仓库成员的人工动作（打标签）
    触发；写入点硬编码目录、文件名不由正文派生、单次只改一个文件、sha 乐观锁、
    只扩 permissions 的声明范围。job 级 permissions 只能收窄不能扩权，故 workflow 级
    必须声明到实际最大值（后人「优化」成 read 会静默失去写入能力）。

## 常见陷阱

- workflow 名称（name:）是 feishu-webhook 白名单与 .pages.yml 动作的匹配键，改名需三处同步；`deploy.yml` 的 `Deploy to Cloudflare Worker` 即三处之一。
- concurrency group 名跨 workflow 同值时互相串行（评论双过滤器的既有行为）。
- **GITHUB_TOKEN 的 push 不触发任何 workflow**（GitHub 防自循环）：机器人提交文件后 `ci.yml`
  与 `push: main` 的通知都不会跑，所以校验必须在写入前完成、通知必须由写入方自己发；
  但 `workflow_dispatch` 可以被 GITHUB_TOKEN 调用（需 `actions: write`，2022-09 起官方支持）。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
