# AGENT.md — pldduck 的 AI 开发者行为准则

本文件约束所有参与 pldduck 仓库工作的 AI 开发者（含代码审查、功能实现、bug 修复、文档维护、脚本编写等全部工作形态）。**修改本文件需用户明确授权。**

## 一、最高约束：功能规则集

- 仓库根目录 [`ai-rules/`](ai-rules/README.md) 为每个功能制定了详细的修改规则（硬性约束）。
- AI 在修改任何功能前，**必须先阅读对应的 ai-rules/\*.md**，并逐条遵守其中的「修改规则」。
- **破例必须请求授权**：当 AI 认为有必要打破任何规则（含修改 ai-rules/ 目录内的文档）时，必须先向用户说明理由并请求准许；**未获明确准许前不得动手**。获准后须在提交信息中注明「依据用户授权破例」。

## 二、项目身份与工作方式

- 项目：pldduck（React 19 + Vite 6 + TypeScript 的 SSG 静态站点，客户端 SPA 水合；Node 构建脚本为 ESM .mjs）。
  线上域名 `www.pldduck.com`，由原个人主页 Dworld 与博客 D-blog 合并而来：首页是**极简个人主页 +
  全站搜索 + 联系方式/订阅入口**（头像、名字、`author.bio`、搜索表单、GitHub / 邮箱 / QQ / RSS /
  更新订阅 / 项目仓库），侧栏只保留导航与工具；文章/说说/友链/留言板等功能页在同一域下的子路径，
  `/post/<id>` 与旧博客逐字节一致。
  全站不再渲染页面底部 Footer（版权只保留在侧栏底部），侧栏顺序固定为
  导航清单 → 服务状态入口 → 版权（版权在最底）。
  全站**深色唯一**：模板固定 `<html class="dark">`，无 ThemeToggle/主题启动脚本/localStorage 主题；
  侧栏「标签」「站内搜索」导航项已分别并入文章列表与顶栏/命令面板。
  旧仓库已改名 `ououduck/D-blog-old` 并封存为迁移跳转页，不再开发。
- 部署形态：GitHub Actions 构建后由 Cloudflare Workers Static Assets 直出静态产物；同一 Worker
  还承载 `worker/index.mjs`（入口）与 `worker/status.mjs`（逻辑），只处理 `GET /api/status`
  （同源代理 Better Stack 状态页）。入口模块只能 `export default { fetch }`，不得导出常量/普通
  函数（Workers 会当成 handler 并拒绝启动）。静态资源不经过 Worker（`wrangler.jsonc` 的
  `assets.run_worker_first` 仅匹配 `/api/*`）。
- 沟通语言：与用户使用**中文**交流；git 提交信息使用**中文**。
- 每完成一个小任务提交一次 git，**只 commit 不 push**（除非用户明确要求推送）。
- 提交前必须通过：`npm run typecheck`、`eslint`、相关单测；涉及构建逻辑的改动需 `npm run build` 验证。
- 用户说「继续」时持续工作；用户没有喊停前不要自行停止。

## 三、技术硬性约束（全仓库通用）

1. **SSG/水合确定性**：任何组件在渲染期不得依赖当前时钟、随机值或客户端专属 API（`Date.now()`、`Math.random()`、`window`/`document` 等）；日期类 UI 必须锚定数据字段（如 `date`/`updatedAt`），渲染期访问客户端 API 需 useEffect 守卫。
2. **UI/主题/功能不变**：除用户明确要求的改动外，不得改变页面 UI、主题样式与既有功能行为。全站**深色唯一**（模板固定 `<html class="dark">`，无 ThemeToggle/主题启动脚本/`localStorage.theme`/系统偏好检测），不得恢复浅色模式、主题切换按钮或 `dblog:toggle-theme` 命令；颜色只走 `src/index.css` 的深色 Token。
3. **错误处理**：网络/存储/解析类操作必须有 try/catch 兜底；「失败」必须如实反馈（返回 null/false 或抛错），禁止静默假装成功。
4. **竞态防护**：异步操作（加载、导出、复制、搜索）必须处理竞态（generation/requestId/cancelled/mountedRef 等既有模式），卸载后不 setState。
5. **资源清理**：事件监听器、定时器、IntersectionObserver/ResizeObserver、订阅必须成对清理。
6. **无障碍**：交互元素有可访问名称；弹层有焦点管理；动态内容有 aria-live 或等效播报；不嵌套 `<main>`。
7. **日志安全**：日志不得输出密钥（飞书机器人 Webhook token、Akismet key 等）；对用户可控文本做净化，防 Actions 命令注入；输出用户可控 URL 前必须脱敏（`sanitizeUrlForLogs`，URL 可能含 userinfo 凭据）。
8. **安全**：对用户可控 URL 发起请求前必须做 SSRF 防护（复用 `scripts/lib/http.mjs` 的 `isSafePublicHttpUrl`）；**重定向必须手动逐跳跟随并重新校验**（`redirect: 'manual'`，公开站点可 302 到内网/回环地址形成跳转绕过），重定向超限判失败（防环）。
9. **性能**：渲染期避免重复计算（useMemo/缓存）；事件高频路径（pointermove/scroll）用 rAF 节流；大列表用稳定 key。
10. **测试**：修复 bug 必须补回归测试；新增逻辑补充单测；测试断言必须有真实行为验证（不得恒真）。
11. **入口守卫**：Node 脚本（scripts/*.mjs）的 main() 只在作为主模块直接运行时执行（`import.meta.url === pathToFileURL(process.argv[1]).href` 判定），被 import 时不得触发网络/写文件副作用。
12. **HTML 结构合法**：交互元素遵循内容模型（`<button>` 内不嵌套标题等 flow content；`<ol>` 直接子元素只允许 `<li>`）；弹层关闭态必须移出可访问性树（`visibility: hidden` 或条件渲染，不能只靠 opacity/pointer-events）。
13. **服务状态接口（Worker `/api/status`）**：
    - **Token 只进 Secret**：`BETTERSTACK_API_TOKEN` 只能通过 Cloudflare Worker Secret 设置（`npx wrangler secret put BETTERSTACK_API_TOKEN`），不得写入 `wrangler.jsonc`、`.env*`、前端构建变量、响应、日志、缓存键或任何提交物；`BETTERSTACK_STATUS_PAGE_ID` 是非敏感 Worker 变量，写 `wrangler.jsonc` 的 `vars`，本地 `wrangler dev` 用已 gitignore 的 `.dev.vars` 覆盖。
    - **前端兜底优先**：`SiteStatusBadge` 首帧固定渲染中性「服务状态」（`unavailable`），只在客户端 effect 中订阅（`siteStatusStore` 统一请求）；只有上游明确返回四种真实状态才更新，**只有 `operational` 显示绿色**。任何失败（未知值/缺字段/非 2xx、含 1027/429、超时、网络断开、坏 JSON）都回退 `unavailable`，**不得伪装成 operational**，也不得隐藏或禁用入口——它始终可点击跳转状态页。
    - **缓存与超时固定**：Worker 成功结果写 Cache API 60 秒、上游 5 秒超时且**不重试**、**失败不写缓存**；前端每 60 秒轮询（仅 `siteStatusStore` 一份 timer）、8 秒超时、不重试、不做结果缓存。静态资源不得进 Worker（`run_worker_first` 只允许 `/api/*`）。
    - 改这条链路必须同步 `ai-rules/site-status.md`，并跑 `worker/index.test.mjs`、`src/services/siteStatus.test.ts`、`src/services/siteStatusStore.test.ts`、`src/components/SiteStatusBadge.test.tsx`、`src/components/WorkersLimitToast.test.tsx`。
14. **首页与全站外壳**：
    - 首页以站主身份为主（头像、名字、`author.bio` 介绍），另含全站搜索表单、联系方式/订阅入口（GitHub / 邮箱 / QQ / RSS / 更新订阅 / 项目仓库）与「看看文章」CTA（桌面卡片 + 最新两篇标题；移动端 pill）。**不得**恢复门户入口、内容列表、开源项目、关于本站、技术栈、订阅卡或状态标签；CTA 最多两篇标题、不是文章列表。门户配置（`config/portal.config.json` / `siteConfig.portal`）已于 2026-11 移除，详见 `ai-rules/home.md`。
    - 全站**不再渲染页面底部 Footer**（`Layout` 无 `Footer` 组件，页面中不得出现 `contentinfo`）；版权只在侧栏底部 `SidebarFooter`，顺序固定为 导航清单 → 服务状态入口 → 版权（版权在最底）；`fillHeight` 下只有中间导航清单滚动，状态入口与版权固定在底部。侧栏分组只有 主页 / 栏目 / 工具（「订阅与联系」已删除，联系方式与订阅入口统一在首页；「标签」「站内搜索」导航项也已删除，标签筛选在文章列表、搜索在顶栏/命令面板）。
    - **Workers 上限提示**：状态请求返回 HTTP 1027/429 时，由全站唯一 store（`src/services/siteStatusStore.ts`）触发一次顶部提示，文案逐字「今日 Workers 请求次数达到上限，部分功能受限」，3 秒自动收回，**每标签页 10 分钟最多一次**；`WorkersLimitToast` 只订阅、不请求、不缓存，不得改成逐组件轮询，也不得增加关闭按钮或持续动画。
    - **首页小部件布局**：首页是站主身份 + 全站搜索 + 联系方式/订阅 + 访问统计 + 内容小部件的
      **小部件（Bento）网格**，卡片顺序固定为 名片卡 → 联系方式 → 推荐阅读 → 访问统计 → 写作档案 →
      标签 → 服务状态（名片卡内名字是唯一 `h1`，其余卡片标题用 `h2`）。桌面 ≥1280px 12 列 /
      ≥1024px 6 列铺满宽度（首页用 `.site-shell main > div:has(.home-page)` 放宽 `max-w-7xl`），
      **手机单列纵向滚动**：不得恢复 `html:has(.home-page)` / `body:has(.home-page)` 的滚动锁或
      `.site-shell:has(.home-page)` 的固定高度，也不得用 JS 写/清 `body.style.overflow`；
      `.home-page` 保留底部 `safe-area + --cookie-notice-height` 留白。访问统计只展示 Vercount 返回的
      `site_pv` / `site_uv` 两项（「统计自 Vercount」是标题后的说明，卡片内不再有本页阅读量、文章数与字数；
      **接口没有「今日」维度，不得自造**），写作档案与推荐阅读的
      时间口径一律锚定构建期数据（最新文章年月），不用时钟/随机。仍**不得**恢复门户入口、整页内容列表、
      开源项目、关于本站、技术栈、订阅卡或状态标签；详见 `ai-rules/home.md`。
15. **交互细节（稳定 DOM）**：文章目录按钮在展开/收起时必须保持同一 button 与双层常驻图标（`List`/`X` 只切换透明度）；**不得**按状态条件替换图标节点（mousedown/mouseup 目标不同会丢失 click，表现为「第二次点击关不掉」）。搜索结果统一 `PostCard variant="banner"` 单列横幅，不得恢复 `CompactPostCard`/三列网格；归档时间线与友链页统一大色块卡片（1/2/3 列），不得退回 `border-t`/`divide-y` 细线列表。阅读页移动端 `.post-meta` 必须作者首行、元信息次行（桌面 `sm:flex-row` 单行）；说说页页头与 `GiscusComments card` 必须是 surface 卡片。
16. **友链自动化（2026-11 定稿，细节见 `ai-rules/friends.md` 规则 3–16）**：
    - **申请检测**：表单合法 + 站点/头像可达 + 反链命中 → 机器人自动写 `friends/<slug>.json`、触发部署并关闭 Issue；任一环节没通过只出证据、Issue 保持开启，等站长人工处理。
    - **人工放行**：唯一标签 `friend-approved`（审核通过）；打上后 `publishRecord` 写入，评论固定「人工审核已通过，已添加至友链页」并自动关闭。**没有**「拒绝」标签/固定拒绝文案，不收就直接手动关闭 Issue。
    - **黑名单**：`config/friend-blacklist.json`（Pages CMS「友链黑名单」）命中的站点/反链页/头像直接拦截并关闭；人工打 `friend-approved` 也绕不过，要收录必须先移除域名。
    - **巡检**：`friend-availability-audit.yml` 维护 `unavailable`；`friend-backlink-audit.yml` **只读**检查反链（不写仓库、不改 Issue、不触发部署），异常汇总推飞书。
    - **飞书通知一律纯文字**：标题与正文不得包含 Emoji（2026-11 用户明确要求）。
    - 检测/渲染/黑名单/巡检的纯函数各有单测，改口径必须同步 `ai-rules/friends.md` 与对应测试。

## 四、目录约定

- `src/` 前端源码（components/pages/hooks/services/utils/ssr）；
- `worker/` Cloudflare Worker 运行时：`index.mjs` 是入口（只允许 `export default { fetch }`），
  `status.mjs` 放 `/api/status` 同源代理的全部逻辑与可测试具名导出；静态资源仍由 `dist/` 直出、
  不在 Worker 里转发；不要在此目录写前端组件或扩大 Worker 的路由面；
- `scripts/` 构建与自动化脚本（Node ESM），共享库在 `scripts/lib/`；
- `ai-rules/` 功能规则集（见第一节）；
- `config/` 构建配置与站点配置（`site.config.json`、`comments.config.json`、友链黑名单 `friend-blacklist.json`）；`config/routes.mjs` 是路由清单的
  **唯一数据源**（页面路径、预加载、sitemap、service worker 拦截模式都由它派生），
  加页面/改路径先看 `ai-rules/routes-single-source.md`，不要在别处再写一份路径表。
- 跨 src/scripts 共享的剥离/提取核心：`src/utils/*-core.mjs`，改动需同时考虑两端调用方。

## 五、验证清单（提交前自查）

- [ ] 已阅读并遵守相关 ai-rules/*.md
- [ ] `npm run typecheck` 通过
- [ ] `npx eslint .` 无错误
- [ ] 相关单测通过（全量 `npm test` 不回归）
- [ ] 构建相关改动已 `npm run build` 验证
- [ ] Worker / `wrangler.jsonc` 改动已用 `npx --yes wrangler@4.123.0 deploy --dry-run` 做配置校验（不实际部署）
- [ ] 服务状态链路改动已跑 `npx vitest run worker/index.test.mjs src/services/siteStatus.test.ts src/services/siteStatusStore.test.ts src/services/siteStatusStore.ssr.test.ts src/components/SiteStatusBadge.test.tsx src/components/WorkersLimitToast.test.tsx`
- [ ] 首页 / 侧栏 / Footer 改动已跑 `npx vitest run src/pages/Home.test.tsx src/services/homeStats.test.ts src/components/Layout.test.tsx`
- [ ] 友链相关改动已跑 `npx vitest run scripts/lib/friend-form-core.test.mjs scripts/lib/friend-backlink.test.mjs scripts/lib/friend-blacklist.test.mjs scripts/lib/render-html.test.mjs scripts/lib/friend-backlink-audit-core.test.mjs scripts/workflows-config.test.mjs scripts/pagescms-config.test.mjs`
- [ ] 提交信息中文、粒度为一个逻辑任务、未 push

## 六、免责与授权

本文件与 `ai-rules/` 的效力来源于用户对 pldduck 仓库的治理意愿。用户保留随时修改、增删任何规则的权力；AI 对规则的理解冲突时，以用户当面的明确指示为准。
