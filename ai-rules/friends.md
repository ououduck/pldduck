# 友链页（Friends）— AI 修改规则

## 功能概述

友情链接展示（正常/失联分组）与友链申请入口（展开面板内三张卡片：① 本站友链信息 → ② 资料填写卡 `FriendApplyForm`，填完拼出预填正文的 GitHub 新建 Issue 链接 → ③ 信息修改联系卡）。提交后由 `.github/workflows/friend-link.yml` 先做**可达性探测**（站点地址与头像在境外打不开就直接自动驳回并关闭 Issue），能访问时再静态抓取对方页面做**反链检测，结果仅作为审核参考证据**；**是否入库完全由站长打标签决定**：`friend-approved` → 机器人自己写 `friends/<slug>.json` 并触发部署，`friend-rejected` → 机器人回复固定拒绝文案并关闭 Issue（不写任何文件）。失联状态由站长在 Pages CMS「友链」集合手动维护（勾选「已失联」写入 `unavailable: true`）；未配置时默认视为正常。

## 关键文件

- `src/pages/Friends.tsx`
- `src/services/friends.ts`（getFriends/getInitialFriends）
- `src/components/effects/useSpotlight.ts`（卡片光效）
- `.github/ISSUE_TEMPLATE/friend-link-application.yml`（申请表单；字段 label 是解析契约，也是页面预填正文的对照物）
- `src/utils/friendIssue.ts`（把页面资料拼成预填 Issue 正文/链接；与解析器的契约由 `friendIssue.test.ts` 的往返与漂移用例守着）
- `.github/workflows/friend-link.yml`（检测 + 人工放行后的写入与部署）
- `scripts/friend-link-check.mjs`（事件编排、抓取、GitHub API）
- `scripts/lib/friend-backlink.mjs`（反链判定纯函数）/ `scripts/lib/friend-form-core.mjs`（表单解析 + 记录校验，唯一校验权威）

## 修改规则（必须遵守）

1. **失联分组**：`friend.unavailable === true` 的友链必须归入「已失联的博客」折叠板块，不混入主列表；标记由站长在 Pages CMS 手动维护，前端只读。
2. **申请入口 = GitHub Issue**：申请友链（面板标题「申请友链」）只有 GitHub Issue 一条路，页面**不发任何请求、不落任何数据**：`FriendApplyForm` 把资料拼成 `<repoUrl>/issues/new?...` 由 `window.open` 打开（`buildFriendIssueUrl`），并保留「改用空白 Issue 表单」链接指向 `siteConfig.friendsPage.applyUrl`（`friend-link-application.yml` 模板，`target="_blank" rel="noopener noreferrer"`）。**关键约束**：预填链接**不得带 `template=` 参数** —— 走 Issue 表单时 GitHub 会忽略 `body`，正文填不进去；因此正文要自己复刻模板渲染出的 `### <label>` 分段与 `- [X]` 勾选项，段标题/顺序/文案的一致性由 `src/utils/friendIssue.test.ts` 同时用解析器往返 + 读模板做漂移守卫。两步向导的步骤状态（`currentApplicationStep`）与本站信息卡（`siteInfo`）保留在组件内。**不得再引入 Tally 等外部表单**（2026-10 用户授权把站内资料卡定位为「预填」而非「采集」，故「不得在站内自建提交表单」按“不得另建采集面”理解）。**已收录条目的信息修改走站长邮箱**（2026-10 用户授权：面板第三张卡片固定写「如果有修改友链信息的需求，请联系邮箱 pldduck@outlook.com」，为组件内常量 `FRIEND_EDIT_CONTACT_EMAIL`，**不为它新增配置键**）；表单的「申请类型」仍保留 `修改`（机器人按归一化 URL 恰好命中一条时才更新），页面下拉只给 `新增` / `下架`。
3. **自动检测仅供参考**：反链检测（`opened`/`edited`/`reopened`/申请人评论触发的 `findBacklink`）**只产出证据评论 + 标签 + 飞书「待审核」**，任何情况下都不得凭检测结果自动写文件。**`friend-approved` 标签是唯一写入触发器**；人工放行时即使检测未命中也照样入库，但评论必须写明「反链未检测到（人工放行）」并附上最后一次证据。**唯一允许机器人自己下的结论是可达性闸门**（2026-10 用户授权）：检测前先探申报的站点地址与头像，任一在 Actions 出口（境外 IP）拿不到 2xx/3xx —— 连接超时/被拒、DNS 失败、4xx（含 403 的禁海外/反爬）、5xx —— 即回复固定话术 `UNREACHABLE_NOTICE`、打 `friend-unreachable`、**关闭 Issue**、推飞书「已驳回」，并跳过反链检测。闸门只驳回不入库；「下架」申请不受闸门约束（站点打不开正是申请人要撤链的理由）。站长不认同自动驳回时，重开 Issue 再打 `friend-approved` 即可正常入库。**`friend-rejected` 分支**：回复固定拒绝文案（邮箱取 `REJECT_CONTACT_EMAIL`，现与站点公开邮箱 `i@pldduck.com` 一致，有漂移测试守着）→ 关闭 Issue → 飞书「已拒绝」，不写文件、不 dispatch、不追加审核页脚（避免被读成「补打标签就能上架」）；重新申请要开新 Issue。
4. **反链判定口径**（改动必须同步本节，不得只写在代码注释里）：
   - 只认 `<a href>` 解析出的绝对 http(s) 地址；host 必须**精确等于或为子域**于 `www.pldduck.com` / `pldduck.com`（`pldduck.com.evil.net`、`evil-pldduck.com` 不算命中）。
   - 判定前先剥离 HTML 注释（主题里注释掉的友链是最可能的假阳性来源）；`<img src>`、`rel=canonical`、`meta refresh`、JS 字符串里的链接一律不算。
   - 抓取后的最终落地 host ≠ 申报 host → 判 `offsite`（防「把域名 301 到 pldduck.com」骗过检测）。
   - 401/403/405/406/407/429 归 `restricted`（可达但拒绝自动化），措辞是「证据不足」而不是「没挂链」。
   - **两个口径故意不一致，不要「顺手统一」**：同一个 403，在反链侧只说明「拿不到证据」（所以不能判他没挂链），在可达性侧则算「这里打不开」（所以自动驳回 —— 站点屏蔽海外确实没法长期合作）。判定入口分别是 `classifyReachability`（纯函数，有单测）与 `buildTransportVerdict`。
   - **假阴性便宜**（申请人可改正文重测、站长可人工放行），**假阳性只影响证据质量**（不再有自动上架），所以口径宁严不误，但任何 verdict 都不能替站长做决定。
5. **写入护栏**（`friend-approved` 分支，全部为硬约束）：
   - 目录**硬编码 `friends/`**，不读 `siteConfig.friendsPage.repoFriendsDir`（CMS 可改的配置值不能指挥机器人往哪写；有漂移测试守着）。
   - 文件名只从 `issue.user.login` 派生，断言 `^[A-Za-z0-9_-]{1,64}$` 且路径归一化后不变；禁止任何来自正文的文本参与文件名。
   - 记录必须经 `validateFriendRecord`（协议限 http/https、名称≤50/简介≤120、去控制字符与零宽、host 不得是 IP 字面量或本站域名）**再写**；必须带 `filename` 键（缺了它 Pages CMS 会生成 `.json` 点文件）。
   - 一次运行只允许改动**一个** `friends/<slug>.json`；`新增` 不得覆盖不同 url 的既有文件；`修改` 必须按归一化 URL 恰好命中一个；`下架` 永远人工（机器人不删文件）。
   - 更新时合并进原 JSON，**原样保留 `unavailable`** —— 机器人永远不许重置站长标记。
   - 用 `getContent` 取 sha 做乐观锁（409 重试一次，仍失败就评论「并发修改，请重试」，绝不覆盖）；写入前按归一化 URL（host 小写、去 www、去尾斜杠）去重，比生成器的原始串去重更严。
   - 提交后必须回读 + `JSON.parse` + 再校验。
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
- `friend.unavailable` 标记只读自 `friends/*.json`（Pages CMS 维护），前端与机器人都不得写入。
- **`template=` 与 `body=` 互斥**：GitHub 用 Issue 表单渲染时忽略 `body` 参数，预填正文只能走不带 template 的 `/issues/new`。代价是申请人绕过了模板的必填校验与勾选框，正文完全由页面拼 —— 拼错一段就是解析失败，`parseFriendIssueBody` 的 `ambiguous` 会退回「缺段/顺序异常」转人工，绝不会写坏文件；改动 `FRIEND_ISSUE_SECTION_LABELS` 或模板 label 都会让 `friendIssue.test.ts` 变红。
- 友链生效要等 `deploy.yml` 跑完（Issue 里写的站点不会立刻出现在 `/friends`）；`pagescms-config.test.mjs` 的配置漂移守卫要求 `applyUrl` 继续用既有键，**不要为友链申请新增配置键**。
- Issue 流程已于 2026-10 经用户授权恢复（旧规则「不要恢复 Issue 流程」作废）；**不要再引 Tally**，也不要因为「以前删过 Issue」就把写文件改回人工录入。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
