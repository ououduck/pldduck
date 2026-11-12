# 文章详情页（Post）— AI 修改规则

## 功能概述

文章详情页：编辑式左对齐标题区（`post-header` 内层 46rem，与正文同轴；移动端封面先于标题/署名，桌面标题/署名先于封面）、SSG 预渲染完整正文、Markdown 渲染（react-markdown + remark/rehype 插件）、代码块（CodeBlock.tsx：复制含失败反馈/下载/键盘可达行号/折叠/总行数）、Mermaid 图表（缩放/平移/主题同步）、阅读进度保存与恢复、文章阅读控制台（桌面 44px 目录按钮 + 小浮层；移动端精简底栏 4 个高频入口）、图片画廊（ImageViewer 多图模式）、相邻文章快捷键、分享。正文为中文长文尺度（移动 17px / 桌面 18px、行高 1.95、46rem 列宽），专注阅读模式放大到 19px / 44rem；文末按「许可 → 作者/改进 → 订阅横条 → 系列 → 相邻 → 相关 → 评论」的顺序收尾，统一用 `surface` / `surface-muted` 大色块 + 少线条的轻量结构。

## 关键文件

- `src/pages/Post.tsx`（约 2600 行，全站最大文件）
- `src/index.css`（`.post-prose` 正文排版、`.code-block` / `.table-wrapper` / `.kbd` 等正文组件样式、`.reading-mode-article` 阅读模式排版；全部走设计 Token）
- `src/utils/headings-core.mjs` / `headings.ts`（标题提取/锚点 id，**构建端与客户端共享**）
- `src/utils/remarkCodeMeta.ts` / `markdown-core.mjs` / `markdownText.ts`
- `src/components/{CodeBlock, TableOfContents, GiscusComments, ShareModal, ProgressiveImage, ImageViewer}.tsx`
- `src/components/ArticleConsole/`（桌面 `CapsuleNav` 44px 目录按钮 + 小浮层；移动端 `ArticleToolbar` 精简底栏；useReadingProgress/useActiveHeading/TocTree/capsuleState）
- `src/components/IssueSubscriptionCard.tsx`（文末订阅横条：surface 弱底 + 文字入口，无重卡片/图标框）
- `src/components/CompactPostCard.tsx`（文末相关文章的轻量横排/竖排小卡）
- `src/utils/readingProgress.ts`

## 修改规则（必须遵守）

1. **SSG 确定性**：正文、标题、阅读时长等全部锚定文章数据；渲染期禁用时钟/随机。
2. **TOC/锚点一致性**：DOM 标题 id 必须与构建端 `extractMarkdownHeadings` 输出的 id 一致；`resolveHeadingId` 的二次扫描必须跳过已占用 id（防重复 id）；修改 headings-core 时同步考虑 post-content-validator 与 TOC。
3. **竞态防护**：文章加载（cancelled）、Mermaid 渲染（cancelled）、阅读进度保存（节流 + 卸载守卫）、分享/复制（seq/generation）的既有防护不得移除。
4. **代码块**：行号折叠（MAX_CODE_LINES）保持惰性初始化；复制/下载走既有工具；代码内容不进行任何 HTML 注入（高亮由 rehype-highlight 处理）。
5. **Mermaid**：缩放必须矢量缩放（改 width 而非 transform: scale）；wheel 用原生非 passive 监听（否则页面同步滚动）；SVG 必须经 DOMPurify 净化（useMemo 缓存）；拖动用 rAF 节流。
6. **HTML 净化**：`dangerouslySetInnerHTML` 内容必须经 DOMPurify（含 KaTeX/Mermaid 注入）。
7. **阅读进度**：进度/恢复逻辑在 `readingProgress.ts`（start/end 阈值、clamp、完成阈值），不得在组件内重写公式。
8. **无障碍**：`role="application"` 仅限 Mermaid 视口容器（其确实接管键盘）；复制/分享按钮有可访问名称；快捷键有 kbd 提示。
9. **性能**：`stripMarkdown(post.content)` 结果必须 useMemo 缓存（meta description 与 articleBody 共用）；useMemo 不得放在条件早退之后（Hooks 规则）。
10. **HTML 结构合法**：正文 Markdown 的块级元素（`img` 渲染器输出的 `figure`）不得留在 `<p>` 内——浏览器解析直出 HTML 时会隐式闭合 `<p>`，落地成「空 `<p>` + 游离 `<figure>`」，既触发水合回退又多出空段落间距。`p` 渲染器以 hast 子树判定段落是否含图片（`[![图](src)](src)` 时 img 在 a 之下，React children 看不到），含图片时升格为 `<div class="md-paragraph">`；`index.css` 的正文段落规则用 `:is(p, .md-paragraph)` 同时覆盖两者，新增段落级排版规则时必须照此写法。
11. **编辑式标题区与移动顺序**：`post-intro` 外层 `max-w-5xl`、内层 `max-w-[46rem]`，与下方 `.post-body` 内层同宽同轴；标题 `h1` 移动端 28px（`text-[1.75rem]`），`sm` 起 2.5rem / `lg` 2.75rem。视觉顺序用 flex `order` 控制、**不复制 DOM**：移动端 breadcrumb → 封面（`order-1`）→ 标题/署名（`order-2`）；桌面 breadcrumb → 标题/署名 → 封面（`sm:order-none`）。署名行 `.post-meta` 移动端是 `flex-col`（作者首行、发布于/更新于/时长/Vercount 阅读量在第二行），`sm` 起 `flex-row` 恢复单行；作者与首条元信息之间的分隔点在移动端隐藏（`:hidden sm:inline` 或等效）。署名只用文字 + 分隔点，**不得**加回图标署名；「编辑」「分享」是 ghost 入口（`min-h-11` 44px、hover `surface-muted`、无边框/实底）。封面固定 `rounded-micro`（4px，`16/10 → 16/8 → 21/9`）且 `loading="eager"`/`fetchPriority="high"`；标题是 LCP，首帧即最终可见，不得加入场动画；`#vercount_value_page_pv` 锚点必须保留。
12. **正文排版 Token 化**：`.post-prose.prose` 固定 `font-family: var(--font-sans)`、移动端 17px / 桌面（≥768px）18px、`line-height: 1.95`、列宽 46rem；h1/h2/h3/h4 字号与留白沿用 `.post-prose` 现有规则（h2 保留一条 `--color-border` 发丝线，h3 不描边），不得在组件里另写一套标题字号。段落、列表、引用、表格、行内 code、`kbd`、脚注、图片、代码块的颜色/间距/圆角必须使用设计 Token（`--color-*` / `--space-*` / `--radius-*` / `--duration-*`）；新增正文样式写在 `index.css` 的 `.post-prose` 区块，段落级规则同时覆盖 `:is(p, .md-paragraph)`。`prose` 插件的 `--tw-prose-*` 变量已统一映射到 Token，**不得**在 `Post.tsx` 里写死色值/px 绕过 Token。
13. **阅读模式排版**：`.reading-mode-article` 下正文 19px / 1.95（≤767px 为 18px）、列宽 44rem（`.post-body > div` 与 `.post-header` 同步收窄），段落间距 `--space-6`（移动 `--space-5`）；标题锚点偏移改用 `--space-8`。阅读模式会隐藏文末许可/作者/订阅/系列/相邻/相关/评论与标题区署名，只保留退出按钮与正文；`readingEndRef` 结尾哨兵在两种模式下都保留，保证阅读进度口径一致——**不得**改这两条宽度而不复核标题锚点与进度恢复。
14. **文末端顺序与轻量结构（2026-11 更新）**：顺序固定为 许可（CC BY-SA）→ 作者/帮助改进 → 订阅横条（`IssueSubscriptionCard`）→ 系列（有系列时）→ 相邻文章 → 相关文章 → 评论，**不得**重排/合并。视觉已从「细线分区」改为「大色块 + 少线条」：许可与作者区是纯文字、不再加 `border-t`；订阅卡、系列区、相邻导航统一用 `rounded-surface bg-surface-muted`（hover 到 `bg-surface`），系列列表为 `rounded-control` 行 + 当前篇 `bg-surface`/`aria-current="page"`，不再要求 `divide-y`；相关文章用 `CompactPostCard` 的轻量网格。**不得**恢复旧规则要求的「每个区块 `border-t` + `divide-y`」写法，也不得改回重卡片/大边框。相邻/相关/评论的既有快捷键与组件（`GiscusComments`、`CompactPostCard`）保持不变。
15. **从「继续阅读」恢复位置**：文章列表的继续阅读 Link 用 `state={{ continueReading: true }}` 标记来源；文章页读取 `location.state`，首次恢复阅读位置时用 `window.scrollTo({ behavior: 'smooth' })`，后续布局校正仍用 `auto`，并在平滑期间暂时跳过 ResizeObserver 触发的 restore；`prefers-reduced-motion` 下必须回退 `auto`。禁止让所有路由恢复都使用平滑滚动（图片/高亮加载后的自动校正会反复动画）。

16. **阅读控制台减负与目录按钮 toggle**：桌面 `CapsuleNav` 收缩态是 **44px 圆形按钮**（目录图标 + 进度环，`h-11 w-11`），hover 250ms 意图延迟轻展开/点击固定展开为小浮层；**不得**恢复高耸的数字胶囊轨、多重描边或常驻大面板。目录按钮必须**双击可关**：`List` 与 `X` 两层图标常驻、只切换透明度，按钮本体与 DOM 节点保持稳定；点击（`toggleConsole`）在已展开时调用 `collapseConsole` 一次清掉 `pinned` / `userExpanded` / `focusWithin` / `hoverPreview` 四种展开来源，并设置 hover 抑制直到指针离开。**不得**改回「按状态条件替换图标」——那会让 mousedown 与 mouseup 落在不同节点，浏览器不派发 click，表现为「第二次点击关不掉」。Pin、面板关闭、Esc、外点、焦点归还（`railToggleRef.focus()`）与移动端 4 个高频按钮（目录/进度/分享/阅读模式）全部保留；低频复制由 `ShareModal` 承担。

17. **面包屑、标签行与 JSON-LD 口径（2026-11 文章 category 删除后）**：可见面包屑固定两级可点 —— 第 1 级「首页」→ `/`，第 2 级「文章」→ `/posts`；JSON-LD 的 `BreadcrumbList` 第 2 项同口径（name「文章」、item `/posts`），**不得**改回旧的 category 文案与对应的带参链接。标题区（`post-header`）新增标签行：每个标签链接 `/posts?tag=<encoded>`，点击进入列表页的标签筛选。文章 JSON-LD 不再输出 `articleSection`，`Seo` 也不再输出 `article:section` meta（文章只有 `tags`，`keywords` 仍由 tags 拼接）；这三处一并改，漏一处会让结构化数据与可见信息不一致。

## 常见陷阱

- 标题含图片/公式时渲染文本与 rawText 不一致 → 锚点错位（按既有 usedHeadingIds 兜底）；
- 修改 headings-core 的正则会影响构建期校验（锚点链接校验）；
- Post.tsx 体量极大，新增逻辑优先抽到 utils/组件，避免继续膨胀。
- 标题区与正文不同轴：外层 `max-w-5xl` 只是留白容器，内层 `max-w-[46rem]` 才与 `.post-body > div` 对齐；只改其中一层会看到标题/正文左缘错位（阅读模式还另有 44rem 收窄）。
- 正文样式只改 `prose` / `md:prose-lg` 工具类：typography 插件选择器特异性更高且可能在产物中后置，必须写在 `.post-prose.prose` 下才能稳定生效；删掉 `.prose` 这一级会静默失效。
- 在 `Post.tsx` 里给标题/正文加内联 `text-[18px]`、`text-zinc-*` 之类硬编码：与 `index.css` 的 Token 冲突，深浅两态/阅读模式会各错一半。
- 改阅读模式宽度或字号后没同步 `post-header` / 进度哨兵：标题与正文错轴、阅读进度恢复落点偏掉。
- 把文末分区改回大卡片/重边框，或把系列列表改成卡片网格：与定稿的轻量风格相反，`Post.test` 的文末顺序与系列结构断言会直接红。
- 恢复旧的「每个区块 `border-t` + `divide-y`」写法：2026-11 起文末统一用 `surface` / `surface-muted` 大色块 + 少线条，细线只作辅助；旧规则 14 的强制线条要求已作废。
- 把桌面目录改回高胶囊轨/常驻大面板，或给移动底栏加回「更多」二级菜单：阅读控制台已减负为 44px 目录按钮 + 小浮层 / 4 个高频按钮，恢复会让正文空间被长期占用。
- 删除 `ShareModal` 的「仅复制链接」并把它塞回移动底栏：低频复制操作由分享弹层承载，底栏只保留高频四项。
- 把目录按钮的 `List`/`X` 改回条件渲染（`isExpanded ? <X/> : <List/>`）：指针下的 DOM 节点在 mousedown/mouseup 之间被替换，click 不会触发，「第二次点击关不掉」会复现。必须用双层常驻图标 + 透明度切换。
- 改移动端文章顺序时复制 DOM 或删掉 `order-1/order-2`：移动端必须 cover-first（封面 → 标题/署名），桌面标题/署名 → 封面；用 flex `order` 控制，DOM 只保留一份。
- 把 `.post-meta` 改回所有断点单行：移动端作者必须独占首行，日期/时长/阅读量在第二行；桌面 `sm:flex-row` 才恢复单行，作者与元信息之间的分隔点移动端要隐藏。改这块至少跑 `Post.test` 的署名/Vercount 锚点断言。
- 把面包屑第 2 级、标题区信息位或 JSON-LD 的 `articleSection` 改回 category：文章 category 已删除，面包屑第 2 级必须是「文章」→ `/posts`，标签行走 `/posts?tag=`，`Post.test` 的标题区/结构化数据断言会红。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
