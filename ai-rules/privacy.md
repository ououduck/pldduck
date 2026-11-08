# 隐私政策 — AI 修改规则

## 功能概述

`/privacy` 是面向访客的隐私说明页，解释本站的本地存储、Clarity/不蒜子统计、Giscus 评论与第三方链接；Cookie 同意使用屏幕中央的模态弹窗，而不是底部横幅。

## 关键文件

- `src/pages/Privacy.tsx`（静态卡片式隐私政策页）
- `src/components/CookieNotice.tsx`（居中 Cookie 弹窗）
- `config/routes.mjs`（`/privacy` 唯一路由登记）
- `src/App.tsx`、`src/utils/preload.ts`、`public/sw.js`（路由消费方；sw 标记区由构建覆写）
- `src/components/SiteSidebar.tsx`（侧栏底部隐私入口）

## 修改规则（必须遵守）

1. **及时同步实际数据行为**：隐私政策必须与代码一致。Clarity 脚本在 `index.html` 中随页面加载；因此不得写成「关闭 Cookie 提示即停用统计」。如需改成真正的 opt-in/opt-out，必须同时修改统计加载逻辑、Cookie 文案与本页，不能只改文案。
2. **Cookie 弹窗方正、正式、居中且可访问**：`AppShell` 在已同意/本会话已关闭或当前为 `/privacy` 时不挂载弹窗 chunk；保持 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`/`aria-describedby`，复用 `useModalOverlay` 的滚动锁、焦点陷阱、Escape 关闭与焦点还原；不得退回底部固定横幅或自行写 body overflow；视觉上用直角边框、无衬线标题与规整按钮，不要用编辑式衬线大标题。
3. **同意语义不变**：「同意」写入 `localStorage.cookie-consent=accepted` 并永久不再弹；关闭/仅浏览写入 `sessionStorage.cookie-dismissed=1`，仅当前会话不弹，**不得**把关闭等同于同意。
4. **隐私入口可达**：Cookie 弹窗内必须有指向 `/privacy` 的链接；侧栏底部保留隐私政策入口。弹窗内点击隐私链接应先关闭弹窗再导航，否则滚动锁会把隐私页锁住；直接访问 `/privacy` 时不得被弹窗遮挡。
5. **路由单一数据源**：`/privacy` 只登记在 `config/routes.mjs`，同步 `App.tsx`、`preload.ts`、sitemap 与 `public/sw.js` 标记区（构建生成）；改路由后跑 `scripts/routes-consistency.test.mjs`。
6. **文案边界**：本页是站点说明，不是针对特定司法辖区的法律意见；不要加入无法兑现的承诺（如「绝不收集任何数据」「完全匿名」）。涉及第三方（GitHub/Giscus、Clarity、不蒜子、友链目标站）明确指向其自身政策。
7. **视觉一致**：页头与各节使用 `rounded-overlay bg-surface` 卡片，标题 `font-serif`；删除英文大写眉题/图标，不用跨页发丝线。Cookie 弹窗同样不加大写英文眉题。

## 常见陷阱

- 改了 Cookie 弹窗但没更新本页/`README`：文案与行为漂移，用户会按错误说明预期；
- 只加 `App.tsx` 路由、不登记 `ROUTES`：`/privacy` 首屏是空壳、不进 sitemap；
- 手改 `public/sw.js` 的 `ROUTES:BEGIN/END` 标记区：下一次构建会被覆写，必须改 `routes.mjs`；
- 在弹窗内用 `<Link>` 导航但不关闭弹窗：`useModalOverlay` 的 body 滚动锁与焦点陷阱会继续作用在隐私页上；
- 把关闭按钮当作拒绝统计：当前关闭只影响提示展示，不控制 Clarity 脚本加载。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
