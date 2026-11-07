# 主题系统（Theme）— AI 修改规则

## 功能概述

浅色/深色二态主题切换：无显式选择时，每次打开页面均按系统偏好（`prefers-color-scheme`）自动检测初始明暗；用户点击切换后，该选择持久化到 `localStorage`，此后稳定沿用。主题切换动画（View Transition）、阅读模式。

UI 重构第二阶段起，全站颜色/字体/间距/圆角/布局宽度/动效统一走**语义设计 Token**（见下方「设计 Token」小节），组件不再各写一套色值。

## 设计 Token

单一来源是 `src/index.css` 的 `:root` CSS 变量，`config/tailwind.config.js` 把它们映射成 Tailwind 语义类：

- **颜色**（`html.dark` 覆盖同一组变量）：`--color-background` / `--color-surface` / `--color-surface-muted` / `--color-text` / `--color-text-secondary` / `--color-border` / `--color-accent` / `--color-success` / `--color-warning` / `--color-danger` / `--color-focus-ring`。Tailwind 侧对应 `bg-background` / `bg-surface` / `bg-surface-muted` / `text-content` / `text-content-muted` / `border-line` / `text-accent` / `text-success` 等。
- **字体**：`--font-sans` / `--font-serif`（中文优先系统黑体/宋体回退链）与 `config/tailwind.config.js` 的 `fontFamily.sans/serif` 必须同步维护。
- **间距**：`--space-1`…`--space-12`（4px 基准），供 CSS 与内联样式引用；Tailwind 的间距刻度保持不变。
- **圆角**：`--radius-sm`(4px) / `--radius-md`(8px) / `--radius-lg`(12px)，与 Tailwind 的 `micro` / `icon` / `overlay` 对齐。
- **布局宽度**：`--content-width`(80rem) / `--article-width`(48rem)。
- **动效**：`--duration-fast`(150ms) / `--duration-normal`(240ms) / `--ease-standard` / `--ease-emphasized`；侧栏宽度过渡、ghost 按钮 hover、加载节拍都挂在这些变量上。

`body` 的背景/文字、`:focus-visible` 的焦点环已直接使用 Token；`html.dark` **只覆盖颜色**，间距/圆角/动效两态共用同一套。既有品牌色类 `paper` / `ink` / `void` 保留兼容，新代码优先语义类。

**文章正文与阅读模式**：`.post-prose.prose` 的字号/行高/颜色/间距全部由 `index.css` 的 `.post-prose` 区块与 Token 提供（移动 17px / 桌面 18px / 行高 1.95 / 46rem 列宽）；阅读模式在 `.reading-mode-article` 下覆盖为 19px / 1.95 / 44rem，段落间距用 `--space-5` / `--space-6`。新增正文或阅读模式排版只改这两处并复用 `--space-*` / `--radius-*` / `--color-*`，不要在 `Post.tsx` 里写死 px 或颜色。

## 关键文件

- `src/index.css`（`:root` / `html.dark` 的设计 Token、`body` 与 `:focus-visible` 基础样式、侧栏与顶栏组件样式）
- `config/tailwind.config.js`（`darkMode: 'class'`、颜色 Token → 语义工具类映射；圆角/层级沿用现有 Tailwind 配置）
- `src/components/Layout.tsx`（ThemeToggle 主题逻辑段）
- `index.html`（首帧防闪内联脚本：管 localStorage 显式选择 + 系统偏好回退）
- `src/components/ReadingModeContext.tsx` / `ReadingModeToggle.tsx`
- `src/hooks/{useMediaQuery, useReducedMotion}.ts`

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
7. **设计 Token 是唯一视觉来源**：颜色、字体、间距、圆角、布局宽度、动效只能改 `src/index.css` 的 Token 与 `config/tailwind.config.js` 的映射；不得在组件里新写十六进制色值、魔数圆角或独立动效时长。Token 值会全站生效，调整前确认深浅两态对比度与现有视觉基线（本次重构的 Token 取的就是改造前的视觉值，换 Token 不应产生突变）。
8. **语义类优先**：新组件/改样式优先用 `bg-background`、`bg-surface`、`bg-surface-muted`、`text-content`、`text-content-muted`、`border-line`、`text-accent` 等语义类；既有 `paper` / `ink` / `void` 保留兼容，但不要在新代码继续扩散。需要透明度时**不要**写 `bg-surface/50` —— `var()` 颜色不支持 Tailwind 的 `/opacity` 修饰符（不会报错，只会得到非预期颜色），改用现成 Token 或新增一个 Token。
9. **深色只覆盖颜色，且不得包 `@layer`**：`html.dark` 仅覆盖 `--color-*`，间距/圆角/动效两态共用；它必须保持**无 `@layer` 包裹** —— `:root` 的变量是无层声明，层内的 `html.dark` 会在层叠优先级上输给无层 `:root`，深色值直接失效。组件不得为语义颜色逐处补 `dark:` 复制值（Token 已两态自适应），只有非语义的特殊场景才允许局部 `dark:`。

## 常见陷阱

- 首次水合解析出的主题若与初始 state 不同会触发一次 setTheme 的 effect 重跑：持久化必须放在 toggleTheme（用户点击）而非 effect 内，否则检测出的默认值会被写盘、失去「每次打开重新检测」能力；
- 全站动效（motion.ts 的 easeOut/easeSmooth）与 reducedMotion 是跨组件契约。
- 把 `html.dark` 包进 `@layer base`（或任何 `@layer`）：无层 `:root` 的变量会赢，深色值静默失效且只在切暗色时暴露。
- 写 `bg-surface/50`、`border-line/70` 之类的透明度修饰：`var()` 颜色不支持 `/opacity`，类名照常生成但不会按预期变透明；需要弱底就新增专用 Token。
- 只改 `--font-sans` / `--font-serif` 而不同步 `config/tailwind.config.js` 的 `fontFamily`（或反之）：CSS 与工具类会落到两套字体链。
- 在组件里逐处补 `dark:bg-zinc-900 dark:text-zinc-100` 复制 Token 已有语义：深色主题调整时这些硬编码会脱队；优先改 Token 或使用语义类。
- 文章正文/阅读模式排版只改 Tailwind 工具类或 `Post.tsx` 内联样式：正文排版以 `index.css` 的 `.post-prose` / `.reading-mode-article` 为准（`prose` 插件选择器特异性更高），绕过去会出现深浅两态或两种模式各错一半。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
