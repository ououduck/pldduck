# 布局与导航（Layout）— AI 修改规则

## 功能概述

全站外壳：左侧可折叠侧边栏导航（lg 及以上常驻，以下换成左侧抽屉）、吸顶细顶栏（折叠/汉堡按钮 + 当前页名 + 搜索 + 主题切换）、主题切换按钮（支持 dblog:toggle-theme 自定义事件供命令面板调用）、移动端抽屉左右滑动手势、返回顶部、页脚、Cookie 提示条、Service Worker 更新提示、命令面板（Ctrl/Cmd+K 与搜索按钮）、错误边界与 View Transitions 页面切换。

## 关键文件

- `src/components/Layout.tsx`（外壳与移动抽屉状态机）
- `src/components/siteNav.ts`（**导航清单唯一来源**：分组、图标、路径/外链、激活判定、顶栏页名解析）
- `src/components/{SiteSidebar,SiteTopBar,ThemeToggle}.tsx`（侧栏体/顶栏/主题按钮）
- `src/App.tsx`（路由 + 错误边界 + View Transitions）
- `index.html`（主题与侧栏折叠态的防闪烁引导脚本）
- `src/components/{BackToTop, OfflineStatus, ServiceWorkerUpdatePrompt, CookieNotice}.tsx`
- `src/components/CommandPalette.tsx`（命令面板，懒加载 chunk）
- `src/components/ArticleConsole/`（文章阅读控制台：桌面胶囊/移动工具栏/进度与激活标题 hooks）
- `src/hooks/useModalOverlay.ts`（弹层栈/滚动锁/焦点陷阱，全局共享）

## 修改规则（必须遵守）

1. **弹层栈语义**：useModalOverlay 的 openOverlayStack/scrollLockCount 是全局共享状态（多层弹层叠加时只第一个锁滚动、最后一个恢复）；hasOpenOverlay 用于页面快捷键守卫 —— 全部不得破坏。
2. **View Transitions**：页面切换必须 try/catch 回退（已有活动 transition 时同步抛 InvalidStateError）；水合首帧 `hasViewTransition=false`。
3. **移动抽屉手势**：抽屉从左侧滑入，关闭手势为**向左滑**（`deltaX` 阈值 + 速度判定），面板自身 `scrollLeft<=1` 才允许起手；touchmove 非 passive 监听与成对释放 —— 保持既有行为。（轴向由底部面板改为左侧面板，依据用户授权破例。）
4. **导航清单唯一来源**：新增/删除页面入口只改 `src/components/siteNav.ts`，桌面侧栏与移动抽屉共用同一份模型；不得在组件里另立第二份清单。`resolveNavLabel` 决定顶栏页名与 `aria-current`。
5. **侧栏折叠态**：视觉状态由 CSS 变量 `--sidebar-active-width` 驱动，`index.html` 引导脚本读 `localStorage['sidebar-collapsed']` 写 `html[data-nav-collapsed]`（渲染期不读存储）；React 只在挂载 effect 中同步出 `aria-expanded`。存储键名在两处一致，改一处必须改另一处。折叠只收放宽度：标签用 `sr-only`/宽度归零隐藏，**不得卸载 DOM**。
6. **监听器清理**：window/document 监听、计时器必须成对清理（含主题切换计时器）。
7. **Cookie 提示**：「同意」永久持久化（localStorage）、「关闭」会话级（sessionStorage）语义保持。
8. **返回顶部**：隐藏时同步 visibility/tabIndex 并主动 blur 焦点。
9. **SSG 确定性**：主题/网络状态/侧栏折叠先渲染默认态再在 effect 中纠正；getServiceWorkerState 只读模块变量。
10. **抽屉动画**：面板只做位移（`transition-property: transform`，静置态 `translate3d(-100%,0,0)` 移出视口），遮罩单独淡入；动画期间不得改变导航行的透明度/可见性（`disabled` 只保留 `cursor-not-allowed`，交互保护由 `disabled` 属性、`[data-locked]` 的 `pointer-events:none` 与 `requestCloseMobileNav` 的动画期守卫三层承担）——行内容在起手/收尾瞬间跳变会读成「二次跳动」。退场曲线用 `[data-state='closing']` 覆盖 timing-function，**时长始终走 `--mobile-nav-duration`**，与 `MOBILE_NAV_ANIMATION_DURATION_MS` 这个唯一同步点不得拆开。

## 常见陷阱

- 修改 Layout 的动画时序会影响 Layout.test（真实计时器等待）；
- 导航项路径必须存在于 `config/routes.mjs`，否则预加载与离线兜底会漏配；
- 顶栏必须保留 `.site-navbar` 类名：`--article-heading-offset` 由它测量，文章目录/胶囊导航/工具栏依赖该偏移；
- 底部贴边浮层（Cookie 条等）在 lg 需用 `lg:left-[var(--sidebar-active-width)]` 让开侧栏；
- z-index 体系（z-nav/z-modal/z-floating 等）由 tailwind 配置定义，改动需全局评估遮挡关系。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
