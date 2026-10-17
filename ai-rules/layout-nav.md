# 布局与导航（Layout）— AI 修改规则

## 功能概述

全站外壳：左侧侧边导航（lg 及以上常驻为图标条，鼠标移入/键盘聚焦时展开为浮层；以下换成左侧抽屉，支持任意页面右滑呼出）、吸顶细顶栏（汉堡按钮 + 当前页名 + 搜索 + 主题切换）、主题切换按钮（支持 dblog:toggle-theme 自定义事件供命令面板调用）、移动端抽屉左右滑动手势、返回顶部、页脚、Cookie 提示条、Service Worker 更新提示、命令面板（Ctrl/Cmd+K 与搜索按钮）、错误边界与 View Transitions 页面切换。

## 关键文件

- `src/components/Layout.tsx`（外壳与移动抽屉状态机）
- `src/components/siteNav.ts`（**导航清单唯一来源**：分组、图标、路径/外链、激活判定、顶栏页名解析）
- `src/components/{SiteSidebar,SiteTopBar,ThemeToggle}.tsx`（侧栏体/顶栏/主题按钮）
- `src/App.tsx`（路由 + 错误边界 + View Transitions）
- `index.html`（主题防闪烁引导脚本；侧栏展开态是纯 CSS 状态，不再需要引导脚本）
- `src/components/{BackToTop, OfflineStatus, ServiceWorkerUpdatePrompt, CookieNotice}.tsx`
- `src/components/CommandPalette.tsx`（命令面板，懒加载 chunk）
- `src/components/ArticleConsole/`（文章阅读控制台：桌面胶囊/移动工具栏/进度与激活标题 hooks）
- `src/hooks/useModalOverlay.ts`（弹层栈/滚动锁/焦点陷阱，全局共享）

## 修改规则（必须遵守）

1. **弹层栈语义**：useModalOverlay 的 openOverlayStack/scrollLockCount 是全局共享状态（多层弹层叠加时只第一个锁滚动、最后一个恢复）；hasOpenOverlay 用于页面快捷键守卫 —— 全部不得破坏。
2. **View Transitions**：页面切换必须 try/catch 回退（已有活动 transition 时同步抛 InvalidStateError）；水合首帧 `hasViewTransition=false`。
3. **移动抽屉手势**：抽屉从左侧滑入，关闭手势为**向左滑**（`deltaX` 阈值 + 速度判定），面板自身 `scrollLeft<=1` 才允许起手；touchmove 非 passive 监听与成对释放 —— 保持既有行为。（轴向由底部面板改为左侧面板，依据用户授权破例。）**打开手势**为任意页面右滑：只在 window 的 passive touchstart/touchend 上做一次判定（横向位移压过纵向 ×1.6、位移 ≥72px 或甩动 ≥40px 且速度 >0.12px/ms），命中后走既有 `openMobileNav`；**不得改成逐帧拖拽预览**（四态状态机 + 双 rAF 起步 + 固定时长卸载经不起 transform 逐帧改写），也不得在 `innerWidth >= 1024`（Tailwind lg，抽屉 lg:hidden 的分界）时触发。**让位优先级（用户明确要求「优先保证文字框和菜单栏」，即内容手势赢、抽屉让路）**：起点落在以下任一处即放弃呼出 —— ① 计算 `touch-action` 含 `none`/`pan-x`/`pan-left`/`pan-right` 的元素及其祖先（`.code-scroll` 声明 `pan-x`，Mermaid 放大态、图片查看器、封面画布声明 `none`）；② 真正溢出的 `overflow-x: auto|scroll` 祖先；③ `input`/`textarea`/`select`/`contenteditable`；④ 双指（touchstart 需 `touches.length === 1`，途中第二指落下由 touchmove 记 `multiTouch`，抬手即放弃 —— 捏合缩放的第一指也会横移数百像素）；⑤ 抬手时选区非折叠且与按下时不同（这次拖的是文字）。所有判据**只读不 preventDefault**、监听保持 passive，因此原生的选字/横滚/缩放不受影响，抽屉也仍能在正文上呼出。**配套 CSS 不可删**：`@media (hover: none) and (max-width: 1023.98px) { html { overscroll-behavior-x: none } }` —— 浏览器的「横向 overscroll = 后退」手势与它抢同一段触摸，不关掉时真机上右滑会被合成器吃掉（页面收不到 touchend，抽屉不弹反倒回退一页），实测由 CDP 原生触摸验证过。
4. **导航清单唯一来源**：新增/删除页面入口只改 `src/components/siteNav.ts`，桌面侧栏与移动抽屉共用同一份模型；不得在组件里另立第二份清单。`resolveNavLabel` 决定顶栏页名与 `aria-current`。
5. **侧栏展开态**：无折叠按钮、无 localStorage、无引导脚本 —— 静置态是图标条，展开完全由 CSS 的 `@media (hover: hover)` + `.site-sidebar:not(:hover):not(:has(:focus-visible))` 驱动（SSG 首帧即确定，无水合差异）。**判据不得用 `:focus-within`**：点击导航项后链接会保留焦点，`:focus-within` 会把浮层一直钉在展开态（鼠标移开也不收），`:focus-visible` 只认真正的键盘聚焦。布局约束：外层 `.site-sidebar` 恒占 `--sidebar-active-width`（= `--sidebar-rail-width`，正文按此让位），内层 `.site-sidebar-inner` 绝对定位、宽度在 `--sidebar-rail-width` 与 `--sidebar-width` 之间过渡，展开时作为**浮层盖在正文之上**，不得改为参与布局（否则正文每帧横向抖动）。`hover: none` 的设备没有鼠标移入这条路，`--sidebar-active-width` 直接取展开宽度常驻全展开（去掉按钮后这是唯一的展开手段）。标签/角标/页脚在静置态用 `opacity: 0` + `pointer-events: none` 淡出，**不得改用 `display:none`，也不得卸载 DOM**：撤出布局会让行高与图标位置在两个状态之间变化，展开时鼠标底下的按钮会跟着往下跳，得再挪一次鼠标才点得到（无障碍名与键盘可达性同理）。同时不得给静置态加 `justify-content: center` 之类的重排（图标横移同样是「不平滑」的来源）。**淡出只是必要条件，不是充分条件**：任何会随宽度变化而换行的文本都得与标签同机制加 `truncate`（`.sidebar-nav-group-title` 曾漏掉，`tracking-[0.2em]` 的「订阅与联系」在图标条里挤成 3 行、展开后回到 1 行，整组连同页脚在展开时上移约 30px —— 横向平移之外的纵向位移都是这么来的，导航行本身两态恒 44px（28px 图标槽 + `py-2`）不会跳）。图标居中靠几何而不是靠状态相关的对齐：图标必须放在固定尺寸的 `.sidebar-icon` 槽（28px）里，与头像同轴，满足 `--sidebar-rail-width = 2 ×（内层 padding-left + 行 padding-left + 半槽）`（现值 60 = 2×(8+8+14)）；头像同用 28px（`.sidebar-brand` 的 `pl-2` 让头像左沿落在 16，与图标槽同列）。**头像不得使用 36px**：图标条的内容盒只有 39px（60 − 1px 右边框 − padding-left 8 − padding-right 12），36px 头像会被 `img{max-width:100%}` 压成 31px 的椭圆且中心偏到 27.5 —— 这正是「收起态图标不居中」的实测成因。`paddingLeft`/`paddingRight` 与槽宽是这套居中公式的三个变量，改任意一个都要重新验算中心。**不得**改用静置态 `justify-content:center` 或清 padding 来做居中（那会在两态间产生横移）。内层需 `z-sidebar`(60) 抬到顶栏与 `main` 之上，又低于 `z-popover`。
6. **监听器清理**：window/document 监听、计时器必须成对清理（含主题切换计时器）。
7. **Cookie 提示**：「同意」永久持久化（localStorage）、「关闭」会话级（sessionStorage）语义保持。
8. **返回顶部**：隐藏时同步 visibility/tabIndex 并主动 blur 焦点。
9. **SSG 确定性**：主题/网络状态先渲染默认态再在 effect 中纠正；侧栏展开态是纯 CSS 状态（不读存储、无需引导脚本）；getServiceWorkerState 只读模块变量。
10. **抽屉动画**：面板只做位移（`transition-property: transform`，静置态 `translate3d(-100%,0,0)` 移出视口），遮罩单独淡入；动画期间不得改变导航行的透明度/可见性（`disabled` 只保留 `cursor-not-allowed`，交互保护由 `disabled` 属性、`[data-locked]` 的 `pointer-events:none` 与 `requestCloseMobileNav` 的动画期守卫三层承担）——行内容在起手/收尾瞬间跳变会读成「二次跳动」。退场曲线用 `[data-state='closing']` 覆盖 timing-function，**时长始终走 `--mobile-nav-duration`**，与 `MOBILE_NAV_ANIMATION_DURATION_MS` 这个唯一同步点不得拆开。

11. **不显示备案号**：页脚与侧栏页脚只输出 `footerText · author.name`，不再有备案入口（2026-10 用户决定「不用显示备案号了」）。`siteConfig.beian` 类型、`SiteBeian` 接口、`.pages.yml` 的「备案信息」字段组与两处渲染代码已整体删除，**不要恢复成条件渲染或再加回配置键** —— 此前它先是必填导致 CMS 删块后全站渲染崩掉，再是可选变成一处没人看的死配置。备案号本身记在这里：湘ICP备2025101669号。

## 常见陷阱

- 修改 Layout 的动画时序会影响 Layout.test（真实计时器等待）；
- 右滑让位不能用「祖先是否溢出」一条判据兜底：`scrollWidth > clientWidth` 只覆盖真的能横滚的容器，漏掉声明 `touch-action: none` 的缩放画布（Mermaid 放大态、封面）与尚未溢出的代码块；反过来 `touch-action` 也替代不了 overflow 检查（默认值是 `auto`，未声明的滚动容器得靠溢出识别）。两条都要留；
- jsdom 里 `scrollWidth`/`clientWidth` 恒为 0，溢出分支在单测中测不到 —— 让位用例要么写 `touch-action` 内联样式，要么在真机（CDP 原生触摸）验证；
- 导航项路径必须存在于 `config/routes.mjs`，否则预加载与离线兜底会漏配；
- 顶栏必须保留 `.site-navbar` 类名：`--article-heading-offset` 由它测量，文章目录/胶囊导航/工具栏依赖该偏移；
- 底部贴边浮层（Cookie 条等）在 lg 需用 `lg:left-[var(--sidebar-active-width)]` 让开侧栏；该变量恒等于**图标条宽度**，hover 展开是浮层、不改它 —— 别把它改成 `--sidebar-width`，否则正文与浮层会一起被推走；
- z-index 体系（z-nav/z-sidebar/z-modal/z-floating 等）由 tailwind 配置定义，改动需全局评估遮挡关系。侧栏浮层用 `z-sidebar`(60)：高于 `z-nav`(50) 与 `main`（relative 且 DOM 靠后，同层会被它盖住），低于 `z-popover`(70) 及以后。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
