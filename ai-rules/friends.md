# 友链页（Friends）— AI 修改规则

## 功能概述

友情链接展示（正常/失联分组）与友链申请入口（展开面板内三张卡片：① 本站友链信息 → ② 资料填写卡 `FriendApplyForm`，填完拼出预填正文的 GitHub 新建 Issue 链接 → ③ 信息修改联系卡）。

`friends/*.json` 有**两条互不相交的写入路径**，各改各的键：

- **A 道 · 申请入库**（`.github/workflows/friend-link.yml`）：先做**可达性探测**（站点地址与头像在境外打不开就直接自动驳回并关闭 Issue），能访问时再静态抓取对方页面做**反链检测，结果仅作为审核参考证据**；**是否入库完全由站长打标签决定**：`friend-approved` → 机器人写记录并触发部署，`friend-rejected` → 回复固定拒绝文案并关闭 Issue（不写任何文件）。此道只写展示字段，**永不触碰 `unavailable`**。
- **B 道 · 失联巡检**（`.github/workflows/friend-availability-audit.yml`，每天 02:00 UTC 定时 + Pages CMS 手动按钮）：探测每条记录的站点 URL，**双向**同步 `unavailable`（下线标失联、恢复移回上方），并**覆盖站长在 CMS 里的手工勾选**（2026-10 用户明确授权）。此道只写 `unavailable` 这一个键，其余字段原样透传。

失联状态未配置时默认视为正常；前端两条路径都只读。

## 关键文件

- `src/pages/Friends.tsx`
- `src/services/friends.ts`（getFriends/getInitialFriends）
- `src/components/effects/useSpotlight.ts`（卡片光效）
- `.github/ISSUE_TEMPLATE/friend-link-application.yml`（申请表单；字段 label 是解析契约，也是页面预填正文的对照物）
- `src/utils/friendIssue.ts`（把页面资料拼成预填 Issue 正文/链接；与解析器的契约由 `friendIssue.test.ts` 的往返与漂移用例守着）
- `.github/workflows/friend-link.yml`（检测 + 人工放行后的写入与部署）
- `scripts/friend-link-check.mjs`（事件编排、抓取、GitHub API）
- `scripts/lib/friend-backlink.mjs`（反链判定纯函数）/ `scripts/lib/friend-form-core.mjs`（表单解析 + 记录校验，唯一校验权威；`withUnavailable` 是 B 道唯一的序列化出口）
- `src/types.ts`（`Friend.unavailable` 的 JSDoc 与本节口径同步）
- `scripts/generate-site-data.mjs`（失联分组：缺键视为 false，不视为主列表之外的独立来源）
- `.github/workflows/friend-availability-audit.yml`（B 道：定时 + CMS 手动按钮）
- `scripts/friend-availability-check.mjs`（B 道入口：探测 → 复测 → 计划 → 单键写入 → dispatch 部署 → 飞书报告）
- `scripts/lib/friend-availability-core.mjs`（B 道判定纯函数：`classifyAuditVerdict` / `buildRunPlan`）
- `scripts/lib/friend-repo-io.mjs`（两条路径共用的 GitHub Contents API 层：读/写 + sha 乐观锁 + workflow dispatch）

## 修改规则（必须遵守）

1. **失联分组**：`friend.unavailable === true` 的友链必须归入「已失联的博客」折叠板块，不混入主列表；缺键视为 false。该键由 **B 道巡检**维护 —— 站长可以在 Pages CMS 勾选「已失联」作为临时处置，但下一轮巡检会按探测结论**双向覆写**（判定可达就移回上方），这是 2026-10 用户明确授权的既定行为，不是 bug。前端两条路径都只读。
2. **申请入口 = GitHub Issue**：申请友链（面板标题「申请友链」）只有 GitHub Issue 一条路，页面**不发任何请求、不落任何数据**：`FriendApplyForm` 把资料拼成 `<repoUrl>/issues/new?...` 由 `window.open` 打开（`buildFriendIssueUrl`），并保留「改用空白 Issue 表单」链接指向 `siteConfig.friendsPage.applyUrl`（`friend-link-application.yml` 模板，`target="_blank" rel="noopener noreferrer"`）。**关键约束**：预填链接**不得带 `template=` 参数** —— 走 Issue 表单时 GitHub 会忽略 `body`，正文填不进去；因此正文要自己复刻模板渲染出的 `### <label>` 分段与 `- [X]` 勾选项，段标题/顺序/文案的一致性由 `src/utils/friendIssue.test.ts` 同时用解析器往返 + 读模板做漂移守卫。两步向导的步骤状态（`currentApplicationStep`）与本站信息卡（`siteInfo`）保留在组件内。**不得再引入 Tally 等外部表单**（2026-10 用户授权把站内资料卡定位为「预填」而非「采集」，故「不得在站内自建提交表单」按“不得另建采集面”理解）。**已收录条目的信息修改走站长邮箱**（2026-10 用户授权：面板第三张卡片固定写「如果有修改友链信息的需求，请联系邮箱 pldduck@outlook.com」，为组件内常量 `FRIEND_EDIT_CONTACT_EMAIL`，**不为它新增配置键**）；表单的「申请类型」仍保留 `修改`（机器人按归一化 URL 恰好命中一条时才更新），页面下拉只给 `新增` / `下架`。
3. **自动检测仅供参考**：反链检测（`opened`/`edited`/`reopened`/申请人评论触发的 `findBacklink`）**只产出证据评论 + 标签 + 飞书「待审核」**，任何情况下都不得凭检测结果自动写文件。**在 A 道内，`friend-approved` 标签是唯一写入触发器**（本条不约束 B 道巡检，见规则 5 的 B 段 —— 也不要拿「检测不自动写」去回滚巡检的单键写入，两者不是一回事）；人工放行时即使检测未命中也照样入库，但评论必须写明「反链未检测到（人工放行）」并附上最后一次证据。**唯一允许机器人自己下的结论是可达性闸门**（2026-10 用户授权）：检测前先探申报的站点地址与头像，任一在 Actions 出口（境外 IP）拿不到 2xx/3xx —— 连接超时/被拒、DNS 失败、4xx（含 403 的禁海外/反爬）、5xx —— 即回复固定话术 `UNREACHABLE_NOTICE`、打 `friend-unreachable`、**关闭 Issue**、推飞书「已驳回」，并跳过反链检测。闸门只驳回不入库；「下架」申请不受闸门约束（站点打不开正是申请人要撤链的理由）。站长不认同自动驳回时，重开 Issue 再打 `friend-approved` 即可正常入库。**`friend-rejected` 分支**：回复固定拒绝文案（邮箱取 `REJECT_CONTACT_EMAIL`，现与站点公开邮箱 `pldduck@outlook.com` 一致，有漂移测试守着）→ 关闭 Issue → 飞书「已拒绝」，不写文件、不 dispatch、不追加审核页脚（避免被读成「补打标签就能上架」）；重新申请要开新 Issue。
4. **反链判定口径**（改动必须同步本节，不得只写在代码注释里）：
   - 只认 `<a href>` 解析出的绝对 http(s) 地址；host 必须**精确等于或为子域**于 `www.pldduck.com` / `pldduck.com`（`pldduck.com.evil.net`、`evil-pldduck.com` 不算命中）。
   - 判定前先剥离 HTML 注释（主题里注释掉的友链是最可能的假阳性来源）；`<img src>`、`rel=canonical`、`meta refresh`、JS 字符串里的链接一律不算。
   - 抓取后的最终落地 host ≠ 申报 host → 判 `offsite`（防「把域名 301 到 pldduck.com」骗过检测）。
   - 401/403/405/406/407/429 归 `restricted`（可达但拒绝自动化），措辞是「证据不足」而不是「没挂链」。
   - **三处判定，两套严格度，不许「顺手统一」**：同一个 403，在反链侧只说明「拿不到证据」（所以不能判他没挂链），在**申请闸门**侧算「这里打不开」（所以自动驳回 —— 站点屏蔽海外确实没法长期合作），在**失联巡检**侧算「可达但受限」（所以不动开关 —— 已收录的友链被反爬挡住不等于对方下线）。入口分别是 `buildTransportVerdict`、`classifyReachability`（A 道，严格）与 `checkUrl` + `classifyAuditVerdict`（B 道，宽容，401/403/405/406/407/429 → `RESTRICTED` 冻结）。`friend-availability-core.test.mjs` 用同一组状态码同时断言两套结论，谁把它们改成一致就会红。
   - **假阴性便宜**（申请人可改正文重测、站长可人工放行），**假阳性只影响证据质量**（不再有自动上架），所以口径宁严不误，但任何 verdict 都不能替站长做决定。
5. **写入护栏**（A/B 两条路径各一套，全部为硬约束）：
   - **A 段 · `friend-approved` 入库**：
   - 目录**硬编码 `friends/`**，不读 `siteConfig.friendsPage.repoFriendsDir`（CMS 可改的配置值不能指挥机器人往哪写；有漂移测试守着）。
   - 文件名只从 `issue.user.login` 派生，断言 `^[A-Za-z0-9_-]{1,64}$` 且路径归一化后不变；禁止任何来自正文的文本参与文件名。
   - 记录必须经 `validateFriendRecord`（协议限 http/https、名称≤50/简介≤120、去控制字符与零宽、host 不得是 IP 字面量或本站域名）**再写**；必须带 `filename` 键（缺了它 Pages CMS 会生成 `.json` 点文件）。
   - 一次运行只允许改动**一个** `friends/<slug>.json`；`新增` 不得覆盖不同 url 的既有文件；`修改` 必须按归一化 URL 恰好命中一个；`下架` 永远人工（机器人不删文件）。
   - A 段**永不触碰 `unavailable`**：更新时合并进原 JSON 并**原样保留**该键 —— 展示字段的写入路径没有重置失联状态的权限，失联键只有 B 段能写。
   - 用 `getContent` 取 sha 做乐观锁（409 重试一次，仍失败就评论「并发修改，请重试」，绝不覆盖）；写入前按归一化 URL（host 小写、去 www、去尾斜杠）去重，比生成器的原始串去重更严。
   - 提交后必须回读 + `JSON.parse` + 再校验。
   - **B 段 · 失联巡检（`friend-availability-check.mjs`）**：只写 `unavailable` **这一个键**，且 `withUnavailable` 是唯一序列化出口（六键顺序、两空格缩进、无结尾换行，其余字段原样透传，**不删键** —— 缺键会让 Pages CMS 的表单显示不出来）。
   - 按 `filename` 定位文件（不按 url 匹配）；值已一致就**完全不写**（避免空提交）；提交后核对这次 commit 只改了预期的那一个文件。
   - **单轮最多标记 3 个失联**（`MAX_MARKS_PER_RUN`，超额候选按文件名排序取前 3、其余只报告，保证同一轮输入产出同一批结论）；移回正常的**恢复不设上限**。
   - 判定不可达必须**等 30s 复测一次、两次都失败才动开关**；`RESTRICTED` / `BLOCKED` / 记录解析失败一律**冻结不动**，只进报告。
   - **不可达占比 ≥50%（且样本 ≥4）判为「是我们出不去，不是它们挂了」，整轮熔断**：丢弃全部写入（含恢复），只报告。单靠 3 个上限挡不住出口 IP 被封 —— 每晚标 3 个、五晚就清空友链，所以主力护栏是熔断 + 冻结，上限只是最后一道。
   - 只认 dispatch `payload.repository.ref == main` 且 `GITHUB_REF` 为 `refs/heads/main`；有实际提交才 `workflow_dispatch` 调 `deploy.yml` 一次。
6. **机制事实**：**GITHUB_TOKEN 的 push 不会触发任何 workflow**（GitHub 防自循环）。所以机器人提交 `friends/*.json` 后 `ci.yml` 与 `push: main` 的飞书通知都不会跑 —— 记录校验必须在写入前完成（`generate-site-data.mjs` 对坏记录只 warn+skip，靠 CI 兜不住），收录通知必须由机器人自己发，部署必须由机器人 `workflow_dispatch` 调 `deploy.yml`（该能力自 2022-09 起官方支持，需 `actions: write`）。
7. **防自循环**：`labeled` 分支要求 `sender.type != 'Bot'`；机器人评论正文嵌 `<!-- pldduck-friend-bot:v1 -->` 标记，带标记的评论一律跳过；评论重测只认 Issue 作者或 `author_association ∈ {OWNER,MEMBER,COLLABORATOR}`；机器人永不编辑 Issue 正文（否则自触发 `edited`）。
8. **搜索过滤**：`getFriendDomain`（new URL 解析）结果必须预计算 Map 缓存（禁止每次击键对全部友链重复解析）；大小写统一用 toLowerCase（非 toLocaleLowerCase，locale 无关）。
9. **SSG 确定性**：友链列表与失联分组首帧由 `getInitialFriends()` 渲染。
10. **光效**：useSpotlight/SpotlightLayer 保持既有实现；卡片 hover 光效不阻塞内容可读；**pointermove 光斑跟随必须保持 rAF 单帧合并**（禁止每次移动直接 setState，卡片子树会高频重渲染）。
11. **日志与评论安全**：Issue 标题/正文/用户字段进 Actions 日志或 Issue 评论前必须过 `sanitizeLogValue`，URL 必须过 `sanitizeUrlForLogs`；拒绝文案是固定串 + 常量邮箱，不掺任何用户输入。

## 常见陷阱

- Issue 表单只有 `required` 校验（GitHub 至今未实现正则/长度/URL 校验），模板里的 `description` 只是提示 —— 真正的校验在 `friend-form-core.mjs`。改模板字段 label 必须同步 `FRIEND_FIELDS`，漂移测试会变红。
- Issue 表单的正文段序与 label 是解析契约；解析有任何异常（缺段/重复段/乱序）都判 `ambiguous` 转人工，**绝不猜测字段值**。
- 反链检测是**静态抓取**，Vue/React 站用 JS 渲染的友链挂件看不到；申请文案必须写明「请放服务端直出的 `<a href>`」。
- **可达性闸门跑在境外出口 IP 上**：开了禁海外的站点、带防盗链的头像 CDN 都可能被判打不开而自动关闭 Issue。误判的补救是让申请人重开 Issue（会立刻重测）或站长直接打 `friend-approved`；不要为了少驳回就把 403 之类改成「不算失败」—— 那等于把闸门关掉。探测只读 64 KB，别拿它当内容检测用。
- `friend.unavailable` 由 B 段巡检维护：**站长在 CMS 里的手工勾选会被下一轮巡检覆写**（2026-10 授权，不是 bug）。前端只读，A 段机器人也永不写它。目前**没有「让某条永久留在失联列表」的开关** —— 想留住就只靠巡检判定维持，或临时别跑那个 workflow；别为此在记录里私加新键（生成器与 CMS 都不认）。
- B 段按记录里的 `filename` 键定位文件，键与真实文件名不一致就判「记录不可用」跳过并告警 —— 仓库里已有实例（`friends/xeiu.json` 内写 `filename: "Xe_iu"`）。这类历史漂移要**先修数据**再谈巡检，别放宽匹配（放宽等于让一个文件去改另一个文件）。
- 巡检探测跑在 Actions 出口 IP 上，本地 `--dry-run` 复现时若开着 Clash/Surge 的 TUN 代理，fake-IP 会让全部站点被 IP 级 SSRF 校验拦成 `BLOCKED`（结论是「冻结不动」，不会误写，但报告毫无意义）；按 `ai-rules/broken-links.md` 的代理例外处理，必要时显式设 `ALLOW_PROXY_ARTIFACT_DNS=1`。
- **`template=` 与 `body=` 互斥**：GitHub 用 Issue 表单渲染时忽略 `body` 参数，预填正文只能走不带 template 的 `/issues/new`。代价是申请人绕过了模板的必填校验与勾选框，正文完全由页面拼 —— 拼错一段就是解析失败，`parseFriendIssueBody` 的 `ambiguous` 会退回「缺段/顺序异常」转人工，绝不会写坏文件；改动 `FRIEND_ISSUE_SECTION_LABELS` 或模板 label 都会让 `friendIssue.test.ts` 变红。
- 友链生效要等 `deploy.yml` 跑完（Issue 里写的站点不会立刻出现在 `/friends`）；`pagescms-config.test.mjs` 的配置漂移守卫要求 `applyUrl` 继续用既有键，**不要为友链申请新增配置键**。
- Issue 流程已于 2026-10 经用户授权恢复（旧规则「不要恢复 Issue 流程」作废）；**不要再引 Tally**，也不要因为「以前删过 Issue」就把写文件改回人工录入。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
