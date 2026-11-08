# 测试约定（testing）— AI 修改规则

## 功能概述

Vitest 测试体系：103 个测试文件 / 1132 个用例；jsdom（src）与 node（scripts、worker）双环境；@testing-library/react；覆盖率门槛。

## 关键文件

- `vitest.config.ts`（环境/覆盖率/门槛）
- `src/test/setup.ts`（jest-dom matchers、scrollIntoView/scrollTo 补齐）
- 各 `*.test.{ts,tsx,mjs}`

## 修改规则（必须遵守）

1. **断言必须真实**：禁止恒真断言（如 MemoryRouter 下断言 window.location、jsdom 下断言 URL 不变）——用 useSearchParams 探针 / dispatchEvent 返回值 / 行为断言替代。
2. **环境声明**：scripts 与 worker 的 node 测试文件头必须 `// @vitest-environment node`（Vitest 4 无 environmentMatchGlobs）。
3. **mock 纪律**：vi.mock 工厂内引用模块级常量必须用 `vi.hoisted`（TDZ）；mock 后必须恢复（afterEach vi.restoreAllMocks / unstubAllGlobals）；页面测试用固定非空数据集（空数据让行为零覆盖）。
4. **回归覆盖**：修复 bug 必须补对应回归测试（含失败分支：存储不可用、加载失败、竞态、边界输入）。
5. **覆盖率门槛**：thresholds（stmts/lines/funcs 50、branches 45）防下滑，本地 test:coverage 必须保持全绿。
6. **异步**：异步断言用 waitFor/findBy；禁止裸 setTimeout 代替等待（flaky）。
7. **SSR/水合**：涉及渲染确定性（日期/时钟）的组件测试需验证 SSR 首帧与客户端一致。
8. **全局 store / 订阅测试**：`siteStatusStore` 这类模块级单例（订阅者、timer、快照）会跨用例残留，必须 `vi.resetModules()` 后重新 import（或 mock 服务层 `getSiteStatus`），并在用例结束显式取消订阅；轮询与节流一律用 fake timers（`vi.useFakeTimers()` + `advanceTimersByTimeAsync`），`sessionStorage` 在 beforeEach 清空、afterEach 恢复真实计时器。断言要验证真实行为：同一时刻只发一个请求、60s 轮询、可见性补刷、最后一个订阅者取消后停止、Workers 上限 10 分钟节流（含存储不可用的回退分支）、无订阅者时不消耗提示窗口。
9. **SSR 安全测试**：涉及 `window` / `document` / storage 的模块（如 `siteStatusStore`）要有独立的 `// @vitest-environment node` 测试文件，验证「无 window/document 时模块可导入、订阅只回放中性快照且不抛错」；**不得**用 jsdom + mock window 冒充 SSR。
10. **全局提示组件（toast）测试**：mock 订阅接口而不是真实轮询；覆盖精确文案（逐字断言，含导出的 `WORKERS_LIMIT_MESSAGE`）、`role="alert"`、颜色与层级类、无关闭按钮、3 秒自动收回、重复触发重新计时、卸载取消订阅并清理 timer（卸载后不得 setState）。
11. **尾斜杠页名归一测试**：`siteNav.ts` 的 `normalizePathname` 会去掉尾斜杠再比较（SSG 产物是 `/posts/`，客户端 pathname 可能是 `/posts`）。改导航/顶栏页名时必须断言 `/posts` 与 `/posts/` 得到同一页名、同一激活态，否则水合首帧文本会抖动；优先直接对 `isNavItemActive` / `resolveNavLabel` 纯函数断言，不要只依赖某个页面的 DOM 间接覆盖。
12. **视觉回归（PostCard / Posts / Search）**：`/posts` 与 `/search` 都断言结果统一为 `PostCard variant="banner"`（`bg-surface-muted` + `rounded-overlay`，移动端封面在上、`sm+` 图左文右）；`/search` 不得出现 `CompactPostCard` 或桌面三列网格。`/posts` 另断言分类文字 tab、单排序按钮、继续阅读 `rounded-overlay bg-surface-muted` 卡片、右侧 `TagsPanel`（桌面 sticky / 移动 `role="dialog"`，`aria-pressed` 筛选态）与 `?tag=` 联动；`PostCard` 的 `variant="card"` 竖排变体仍保留测试，但生产搜索结果只用 banner。不锁整段 className。
13. **文章页视觉回归（Post）**：标题区断言署名/发布于/阅读时长/编辑/分享与不蒜子锚点 `#busuanzi_page_pv` 齐备，`.post-meta` 在移动端是 `flex-col`（作者首行、元信息第二行）、`sm:flex-row` 单行，作者与元信息之间的分隔点移动端隐藏；文末端顺序用 `compareDocumentPosition` 断言「许可 → 作者/改进 → 订阅 → 系列（有系列时）→ 相邻 → 相关 → 评论」；系列区断言 `ol > li` 数量、当前篇 `aria-current="page"`/「当前」标记与上/下一章；阅读模式断言控制台隐藏、退出按钮与正文 `post-prose` 容器保留。**正文计算样式（17/18/19px、行高 1.95、46/44rem）不要写进 jsdom 用例**：jsdom 不加载 `index.css`，`getComputedStyle` 拿不到真实排版，这类改动用浏览器截图/构建产物核对，单测只锁类名、结构与语义。
14. **内容页视觉回归（Archive / Search）**：两个页面都断言「已删除英文大写眉题」（`Archive` / `Search` 不应作为可见标题出现）与 `h1.font-serif`；归档断言年份/月份/文章行的 `rounded-overlay bg-surface-muted` / `rounded-control bg-surface` 卡片结构（不再要求 `border-t`/`divide-y`）、ghost「全部展开/折叠」按钮的 `aria-pressed` 与文章行保留分类/时长/评论语义；搜索断言范围文字 tab 的 `aria-pressed`/`?scope=` 联动、banner 同构骨架与 `Ctrl / ⌘ + K` 静态提示。**独立标签页已退役**：不要再为 `/tags` 写页面视觉断言，只有重定向/`?tag=` 筛选契约（见规则 18）。顺序/结构类断言优先用角色、文案与关键结构类，不要锁整串 className。
15. **深色唯一视觉回归**：主题只有深色一套（`<html class="dark">`、`:root` 直接深色 Token），**没有浅色/ThemeToggle/主题切换**；单测断言不存在主题切换按钮、`localStorage.theme` 写入或 `dblog:toggle-theme` 命令。`getComputedStyle` 在 jsdom 下拿不到 `index.css` 的真实样式，**不得**写颜色计算断言；单测只锁语义类（`bg-background` / `bg-surface` / `text-content` / `border-line`）与结构，颜色/对比度用深色浏览器截图（1440×900、390×844、文章页/阅读模式）核对。
16. **首页 Hero/搜索/联系/CTA 与移动全屏**：`Home.test` 断言 Hero（`home-hero`）、`role="search"` + sr-only label + 空查询跳 `/search`、非空跳 `/search?q=<encoded>`（用 `useNavigate` mock 或 Router 探针，禁止断言 `window.location`）；联系方式区断言 GitHub/邮箱/RSS/更新订阅/项目仓库与 QQ 复制反馈；「看看文章」CTA 断言移动端 pill 链接与桌面 `bg-surface` 卡片、`最新发布` 恰好两篇文章标题且按 `updatedAt || date` 降序（数据来自构建期 `getInitialPosts`，无 fetch/随机）；Hero 的 `.home-reveal`/`data-home-reveal` 与 reduced-motion 分支用结构/类名断言。移动端全屏滚动锁属于 CSS（`html:has(.home-page), body:has(.home-page)` + `.home-page` 100dvh），jsdom 不加载 CSS，**不得写「已锁滚动」的计算断言**；只能断言 `.home-page`/`home-contact-grid`/`.home-articles-cta` 结构与「没有 JS 写 body.style.overflow」。`siteNav.ts`/Layout 断言侧栏没有「订阅与联系」「标签」「站内搜索」入口。
17. **剩余页面视觉回归（Friends / ShuoShuo / Guestbook / NotFound / Cover / Watermark）**：统一断言无英文大写眉题与 `h1.font-serif`；友链断言页头/搜索/申请/提示/友链主列表与失联列表均为卡片式（`rounded-overlay bg-surface` / `bg-surface-muted`，1/2/3 列 `gap-3` 网格），不再断言 `border-t`/`divide-y`；说说断言页头 `rounded-overlay bg-surface` 卡片、`GiscusComments` 带 `card` prop（`rounded-overlay bg-surface` 容器），留言板断言轻页头 + giscus 容器仍在；404 断言 `Page Missing` 不存在、`404` 水印 `aria-hidden`、ghost 返回按钮与最近文章列表；封面/水印断言页头与 Cover 的 `role="tab"` 文字 tab（`aria-selected`/方向键）保留。**这些断言锁结构与可访问语义，不锁整段 className。**
18. **退役的 `/tags` 与标签筛选契约**：`public/_redirects` 仍须把 `/tags` 与 `/tags/*` 301 到 `/posts`；`App.tsx` 的 `TagsRedirect` 仍须把 `?tag=` 转交 `/posts?tag=`；全站标签链接一律 `/posts?tag=`。改标签能力时断言「非法 tag 从 URL 清理并回退全部文章」「点击标签写入 /posts?tag=」「移动标签 dialog 可 Escape 关闭且焦点回到入口」，**不得**恢复 `/tags` 的 SSG/sitemap 或页面测试。
19. **文章阅读控制台减负回归**：桌面 `CapsuleNav` 收缩态断言 44px 圆形目录按钮（`h-11 w-11` 量级）与展开浮层，不得恢复高胶囊轨/常驻大面板；**目录按钮二次点击必须收起**（断言点击两次后 `aria-expanded=false`，且按钮内 `List`/`X` 两层图标全程存在、只切换透明度——防止条件替换导致 click 丢失的回归）；移动 `ArticleToolbar` 断言只有目录/进度/分享/阅读模式四个按钮、没有「更多」菜单；文末断言顺序「许可 → 作者/改进 → 订阅 → 系列 → 相邻 → 相关 → 评论」，且使用 `surface`/`surface-muted` 色块（不再强制 `border-t`/`divide-y`）；系列当前篇保留 `aria-current="page"`。

## 常见陷阱

- jsdom 无 canvas/IntersectionObserver/matchMedia：按既有 stub 模式处理，不视为问题；
- 修改测试基建（setup/vitest 配置）需全量回归（103 文件）；
- 模块级缓存（如 busuanzi 的 lastResponse、routeData 的单例、siteStatusStore 的订阅者/timer/快照）
  会跨用例共享：测试「无缓存」「无残留订阅」前提必须用 vi.resetModules 隔离或改为验证真实行为；
- `sessionStorage` 节流与 fake timers 配合时，`vi.setSystemTime` 与 `advanceTimersByTime` 要分开控制，
  beforeEach 清空存储、afterEach `vi.useRealTimers()`，否则上一个用例的提示窗口会漏到下一个；
- 视觉重构只跑单个页面测试：`PostCard` 被 Posts/Search 共用，改布局至少同时跑
  `src/components/PostCard.test.tsx`、`src/pages/Posts.test.tsx`、`src/pages/Search.test.tsx`；
- 用整段 className 快照锁视觉：Tailwind 类序/合并方式一改就红，且看不出行为回归；用角色、文案、
  关键结构类断言；
- 尾斜杠只在 Router 层测：`normalizePathname` 是纯函数，直接在 `siteNav` 层断言 `/posts` 与
  `/posts/` 等价，比在页面里造两种 URL 更稳定；
- 文章页视觉只断言 className、不断言文末顺序/系列结构：顺序回退和「当前篇」标记丢失都测不出来；
  文末用 `compareDocumentPosition`、系列区用 `ol > li` 与 `aria-current` 断言；
- 想在 jsdom 里验证正文 `font-size`/`line-height`/46rem：jsdom 不加载 `index.css`，结果恒为默认值；
  这类排版改动用深色浏览器截图（1440×900 / 390×844、阅读模式）核对；
- 给已退役的 `/tags` 写页面测试，或把 `TagsPanel` 的筛选按钮当成「旧标签云导航」：`TagsPanel` 是同一页面内的
  filter toggle，`aria-pressed` 合法；`/tags` 只剩 301/客户端重定向契约，不要再恢复页面测试；
- 内容页/文章列表视觉只用 className 断言：至少同时断言页头文案、横幅 `variant="banner"` 结构、标签卡/弹窗、
  文末顺序/系列结构等可访问语义，否则恢复旧网格/眉题/胶囊都测不出来；
- 深色唯一改动只跑单页/不截图：全站只有一套深色 Token，至少人工核对 1440×900 / 390×844、首页 Hero、
  文章页/阅读模式、侧栏、顶栏与弹层；发现某处仍是浅色底或蓝链接，说明有组件绕过了 `bg-background` /
  `text-content` / `border-line` 语义类；
- 恢复 ThemeToggle/浅色模式/`localStorage.theme` 后不更新测试：深色唯一断言（规则 15）会红；同理不要为
  「浅色截图」留测试分支，主题只有深色；
- 在 jsdom 里断言首页「移动端已锁滚动」：滚动锁是 CSS `:has(.home-page)`，jsdom 不加载 `index.css`；
  正确断言是 `.home-page` 结构 + 没有 JS 写 `body.style.overflow`，实际滚动行为用 390×844 截图/浏览器核对；
- 把目录按钮两层图标改回条件渲染后只测第一次点击：必须断言连点两次后 `aria-expanded=false`，否则
  mousedown/mouseup 目标替换导致 click 丢失的回归测不出来（规则 19）；
- 把搜索改回桌面三列网格/CompactPostCard 后不更新 Search.test：结果已统一 banner，`Search.test` 会红；
- 只把 Archive/Friends 的主列表改成卡片、页头/筛选/面板仍是细线容器：这些页面已统一卡片化，视觉回归
  至少核对页头、筛选区、主列表与失联/申请面板；
- 「看看文章」CTA 只测链接存在：必须断言恰好两篇「最新发布」标题、移动端只有 pill、桌面卡片结构；
  否则 CTA 被扩成文章列表或移动端误渲染标题区都测不出来；
- 把 `.post-meta` 在测试里只断言作者/日期存在：移动端布局回退成单行不会有任何测试变红；至少断言
  `flex-col` 与 `sm:flex-row` 两套结构，或把移动端换行纳入截图核对；
- 说说页只测 giscus iframe 编号：页头卡片的 `rounded-overlay bg-surface` 与 `GiscusComments card`
  容器丢失不会影响数据断言，视觉回归要单独断言；
- 把桌面目录改回高胶囊轨/给移动底栏加「更多」菜单后只跑构建：阅读控制台减负断言（规则 19）会红；
  改控制台至少跑 `CapsuleNav.test`、`Post.test` 与移动工具栏相关用例；
- 首页搜索写成「输入即结果」后只测输入框：首页职责只有跳转，正确断言是提交后导航到 `/search?q=`；
  内嵌结果会把搜索页的评分/防抖/空态职责复制两份，后续必然漂移；
- 在 `siteNav` 恢复「订阅与联系」/「标签」/「站内搜索」或把 RSS/邮箱塞进侧栏后不更新测试：侧栏分组断言
  （规则 16）会红，这是有意的——联系/订阅入口已统一到首页，标签筛选在 `/posts`，搜索在顶栏/命令面板；
- 等待动画/异步完成禁用裸 setTimeout（Layout 的 600ms sleep、SlideModal 的
  50ms 均曾为此类）——用 waitFor 轮询状态或 fake timers + advanceTimersByTime；
- URL 等静态方法的 mock 用 vi.spyOn（可被 restoreAllMocks 恢复），勿用
  Object.defineProperty 覆写（无法恢复，违反 mock 纪律）。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
