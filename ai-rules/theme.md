# 主题系统（Theme）— AI 修改规则

## 功能概述

浅色/深色二态主题切换：无显式选择时，每次打开页面均按系统偏好（`prefers-color-scheme`）自动检测初始明暗；用户点击切换后，该选择持久化到 `localStorage`，此后稳定沿用。主题切换动画（View Transition）、阅读模式。

## 关键文件

- `src/components/Layout.tsx`（ThemeToggle 主题逻辑段）
- `index.html`（首帧防闪内联脚本：管 localStorage 显式选择 + 系统偏好回退）
- `src/components/ReadingModeContext.tsx` / `ReadingModeToggle.tsx`
- `src/hooks/{useMediaQuery, useReducedMotion}.ts`
- `tailwind.config.js`（darkMode: 'class'）

## 修改规则（必须遵守）

1. **darkMode 实现**：`dark:` 变体基于 `<html>` 的 dark class；不得改为媒体查询模式（与现有 class 策略冲突）。
2. **SSR/水合**：首帧渲染默认态（无 dark class），水合后 effect 中应用已保存/检测主题；`document.startViewTransition` 必须 try/catch 回退。
3. **持久化**：`localStorage.theme` 只存 'light'|'dark'。仅用户显式点击切换时写入（见 toggleTheme）；首次打开检测出的系统默认值不落盘，以便下次打开重新检测。旧值 'system' 视为无显式选择。存储不可用时静默降级（不影响功能）。
4. **系统检测**：仅在打开页面（首次水合）时按 `prefers-color-scheme` 解析初始明暗；不设「跟随系统」模式、不监听系统变化实时切换。index.html 的内联首帧脚本必须与上述语义保持一致（显式选择优先，否则按系统偏好回退）。
5. **阅读模式**：ReadingModeContext 的栈式 Escape 守卫（ESC 栈顶退出）保持。
6. **加载指示只有一个出口**：页面级与列表级的加载态一律用 `ContentStatus.tsx` 的 `LoadingStatus`
   （三枚「小鸭掌」+ `PLDDUCK` 花体字样 + 文案，`role="status" aria-live="polite"`），路由懒加载占位
   （`App.tsx` 的 `RouteFallback`）也必须走它。图形全在 `index.css` 的 `.duck-loader*` 里，颜色只取
   `currentColor`（明暗两处靠外层 `text-zinc-400 dark:text-zinc-500` 继承），字样用 `font-serif`
   （Playfair Display）斜体粗体，**不得引入图片/图标字体**，也不要在别处再写第二套 spinner。
   **所有节拍挂在 `--loader-beat` / `--loader-ease` 上**：脚掌与字样同拍、扫线取两拍，新增片段也走这两个变量
   —— 各元素相位锁定才不会跳出「两套周期互相拍频」的割裂感；整块出现时统一 `duck-loader-in` 淡入上移。
   发丝线宽度由 `.duck-loader-group` 拉伸跟随字样宽度，不写死尺寸。
   **减弱动效靠 CSS 媒体查询**（`@media (prefers-reduced-motion: reduce)` 分支：脚掌与字样静止常亮、扫线隐藏），
   不用 `useReducedMotion()` —— 它是纯样式状态，JS 开关会让组件多一个无谓的订阅。

## 常见陷阱

- 首次水合解析出的主题若与初始 state 不同会触发一次 setTheme 的 effect 重跑：持久化必须放在 toggleTheme（用户点击）而非 effect 内，否则检测出的默认值会被写盘、失去「每次打开重新检测」能力；
- 全站动效（motion.ts 的 easeOut/easeSmooth）与 reducedMotion 是跨组件契约。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
