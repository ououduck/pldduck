# 主题系统（Theme）— AI 修改规则

## 功能概述

全站**深色唯一**（2026-11 用户确认删除浅色模式）：`index.html` 固定 `<html lang="zh-CN" class="dark">`，
并声明 `<meta name="color-scheme" content="dark">`；没有 ThemeToggle、没有主题启动脚本、没有
`localStorage.theme`、没有 `prefers-color-scheme` 初始检测，也没有 `dblog:toggle-theme` 自定义事件。
全站只有一套深色设计 Token；首页 Hero 使用 CSS staggered reveal（`prefers-reduced-motion` 下直接可见）；
阅读模式保留。

## 设计 Token

单一来源是 `src/index.css` 的 `:root` CSS 变量（**不再有 `html.dark` 颜色覆盖**），
`config/tailwind.config.js` 把它们映射成 Tailwind 语义类：

- **深色 Token**：`--color-background` = `#0a0a0a`、`--color-surface` = `#141414`、
  `--color-surface-muted` = `#1f1f1f`、`--color-text` = `#fafafa`、`--color-text-secondary` = `#a3a3a3`、
  `--color-border` = `#262626`、`--color-accent` = `#fafafa`、`--color-focus-ring` = `#fafafa`。
  兼容类 `paper` = `#141414`、`ink` = `#fafafa`、`void` = `#0a0a0a`。
  `success` / `warning` / `danger` 仍保留语义色（成功 / 告警 / 错误 / 失联），只用于状态，不得当装饰色。
- **Tailwind 语义类**：`bg-background` / `bg-surface` / `bg-surface-muted` / `text-content` /
  `text-content-muted` / `border-line` / `text-accent` / `text-success` 等。
- **字体**：`--font-sans` / `--font-serif` 与 `config/tailwind.config.js` 的 `fontFamily.sans/serif` 必须同步维护。
- **间距**：`--space-1`…`--space-12`（4px 基准），供 CSS 与内联样式引用；Tailwind 间距刻度不变。
- **圆角**：`--radius-sm`(4px) / `--radius-md`(8px) / `--radius-lg`(12px)，与 Tailwind `micro` / `icon` / `overlay` 对齐。
- **布局宽度**：`--content-width`(80rem) / `--article-width`(48rem)。
- **动效**：`--duration-fast`(150ms) / `--duration-normal`(240ms) / `--ease-standard` / `--ease-emphasized`。

`<html class="dark">` 只用于让既有 `dark:` 工具类生效；颜色本身由 `:root` 的深色 Token 提供，
**不要**再写 `html.dark { --color-* }` 覆盖（会与 `:root` 形成两套来源）。

**首页小部件与入场动效**：首页是 surface 大色块的小部件网格，名片卡内保留 `.home-widget-glow`
低对比径向光；`.home-reveal` 用 CSS keyframes 按 `data-home-reveal="card-N"` 的固定
`--home-reveal-delay`（0 → 360ms，每张 +60ms）依次淡入/上移。动画纯 CSS、无 JS 控制显隐；
`@media (prefers-reduced-motion: reduce)` 下所有 `.home-reveal` 直接 `animation: none`（内容立即可见）。
不使用 framer-motion 入场。

**文章正文与阅读模式**：`.post-prose.prose` 的字号/行高/颜色/间距全部由 `index.css` 的 `.post-prose`
区块与 Token 提供（移动 17px / 桌面 18px / 行高 1.95 / 46rem）；阅读模式在 `.reading-mode-article`
下覆盖为 19px / 1.95 / 44rem，段落间距 `--space-5` / `--space-6`。

## 关键文件

- `src/index.css`（`:root` 深色 Token、`body` / `:focus-visible`、`.home-widgets` 网格 /
  `.home-widget-glow` / `.home-reveal`、侧栏与顶栏样式、文章正文与阅读模式）
- `config/tailwind.config.js`（`darkMode: 'class'`、颜色 Token → 语义工具类映射）
- `index.html`（`<html class="dark">`、`color-scheme: dark`、`theme-color`）
- `src/components/home/Widget.tsx`（小部件卡片外壳与 `data-home-reveal` 序号）
- `src/components/ReadingModeContext.tsx` / `ReadingModeToggle.tsx`
- `src/hooks/useReducedMotion.ts` / `useMediaQuery.ts`

## 修改规则（必须遵守）

1. **深色唯一**：不得恢复浅色模式、ThemeToggle、主题启动脚本、`localStorage.theme`、系统偏好检测或任何主题切换入口（含顶栏按钮与命令面板命令）。`index.html` 的 `class="dark"`、`color-scheme: dark` 与 `theme-color` 必须保留；删除它们会让首帧闪白、原生控件回到浅色。
2. **SSR/首帧**：HTML 模板直接输出深色，首帧不存在「先浅后深」的切换；组件不得在渲染期读 `localStorage`/`matchMedia`/`document` 决定主题。阅读模式的进入/退出动画必须 try/catch 回退。
3. **设计 Token 是唯一视觉来源**：颜色、字体、间距、圆角、布局宽度、动效只能改 `src/index.css` 的 Token 与 `config/tailwind.config.js` 的映射；不得在组件里新写十六进制色值、魔数圆角或独立动效时长。颜色 Token 是**深色黑白强对比**（近黑底 / 近白字），调整前必须全站核对文章正文、代码块、侧栏、顶栏、状态入口、表单、弹层。
4. **语义类优先**：新组件/改样式优先用 `bg-background`、`bg-surface`、`bg-surface-muted`、`text-content`、`text-content-muted`、`border-line`、`text-accent` 等语义类；既有 `paper` / `ink` / `void` 保留兼容，新代码不要扩散。需要透明度时**不要**写 `bg-surface/50` —— `var()` 颜色不支持 Tailwind `/opacity` 修饰符；改用现成 Token 或新增 Token。
5. **禁止回退浅色/彩色**：页面底色不得改回纯白或暖米色 `#f2f0e9`，链接不得改回蓝色 `#0969da`；`accent` 与正文同色（近白），可点击性靠下划线/hover 表达。`success` / `warning` / `danger` 只允许出现在状态语义，不得用作主色或装饰。
6. **首页小部件入动效**：只用 CSS `.home-reveal`（`data-home-reveal="card-N"` + `--home-reveal-delay`），不得改成 framer-motion/JS 控制显隐，也不得让内容依赖动画结束才可见。`prefers-reduced-motion: reduce` 分支必须保留（`animation: none`，内容直接可见）；首屏 LCP 元素（头像/标题）不得被动画长时间遮挡，动画不得引发布局位移。
7. **阅读模式**：ReadingModeContext 的栈式 Escape 守卫（ESC 栈顶退出）保持；进入/退出时的快照恢复与目录状态记忆不得破坏。
8. **加载指示只有一个出口**：页面级/列表级加载态一律用 `ContentStatus.tsx` 的 `LoadingStatus`（`role="status" aria-live="polite"`），路由懒加载占位也必须走它；图形在 `index.css` 的 `.duck-loader*`，颜色只取 `currentColor`，节拍挂在 `--loader-beat` / `--loader-ease`，减弱动效走 CSS 媒体查询。
9. **文章正文排版**：`.post-prose.prose` 与 `.reading-mode-article` 的规则只能写在 `index.css`（typography 插件选择器特异性更高）；字号/颜色/间距全部走 Token，不得在 `Post.tsx` 里写死 px 或颜色。

## 常见陷阱

- 恢复 ThemeToggle / 主题切换命令 / `localStorage.theme` / `prefers-color-scheme`：全站已深色唯一，恢复会在首帧产生闪烁并让 Token 与主题状态出现两套来源。
- 把颜色改回浅色底（`#ffffff` / `#f2f0e9`）或蓝色链接（`#0969da` / `text-blue-*`）：会破坏深色唯一与黑白强对比基线。
- 在组件里给颜色补 `dark:` 或 `bg-white`：`<html class="dark">` 下 `bg-white` 仍是白块，必须用 `bg-surface` / `bg-background` 语义类。
- 再加 `html.dark { --color-* }` 覆盖：`class="dark"` 只是让 `dark:` 变体生效，颜色 Token 已在 `:root` 定义，覆盖会形成第二套来源。
- 把首页 reveal 改成 framer-motion、JS 延迟挂载或 `opacity:0` 初始 inline style：SSR/无 JS 会空白，且与 reduced-motion 分支脱节。
- 删掉 `@media (prefers-reduced-motion: reduce)` 的 `.home-reveal { animation: none }`：对动效敏感用户会看到错落入场。
- 写 `bg-surface/50`、`border-line/70` 之类的透明度修饰：`var()` 颜色不支持 `/opacity`；需要弱底就新增 Token。
- 只改 `--font-sans` / `--font-serif` 而不同步 `config/tailwind.config.js` 的 `fontFamily`（或反之）：CSS 与工具类会落到两套字体链。
- 文章正文/阅读模式排版只改 Tailwind 工具类或 `Post.tsx` 内联样式：正文排版以 `index.css` 的 `.post-prose` / `.reading-mode-article` 为准。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
