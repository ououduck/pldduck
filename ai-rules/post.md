# 文章详情页（Post）— AI 修改规则

## 功能概述

文章详情页：编辑式左对齐标题区（`post-header` 内层 46rem，与正文同轴）、SSG 预渲染完整正文、Markdown 渲染（react-markdown + remark/rehype 插件）、代码块（CodeBlock.tsx：复制含失败反馈/下载/键盘可达行号/折叠/总行数）、Mermaid 图表（缩放/平移/主题同步）、阅读进度保存与恢复、文章阅读控制台（ArticleConsole：桌面胶囊导航 + 移动工具栏 + 目录，统一进度/激活标题数据源）、图片画廊（ImageViewer 多图模式）、相邻文章快捷键、分享。正文为中文长文尺度（移动 17px / 桌面 18px、行高 1.95、46rem 列宽），专注阅读模式放大到 19px / 44rem；文末按「许可 → 作者/改进 → 订阅 → 系列 → 相邻 → 相关 → 评论」的轻量分区收尾。

## 关键文件

- `src/pages/Post.tsx`（约 2600 行，全站最大文件）
- `src/index.css`（`.post-prose` 正文排版、`.code-block` / `.table-wrapper` / `.kbd` 等正文组件样式、`.reading-mode-article` 阅读模式排版；全部走设计 Token）
- `src/utils/headings-core.mjs` / `headings.ts`（标题提取/锚点 id，**构建端与客户端共享**）
- `src/utils/remarkCodeMeta.ts` / `markdown-core.mjs` / `markdownText.ts`
- `src/components/{CodeBlock, TableOfContents, GiscusComments, ShareModal, ProgressiveImage, ImageViewer}.tsx`
- `src/components/ArticleConsole/`（useReadingProgress/useActiveHeading/TocTree/CapsuleNav/ArticleToolbar/capsuleState）
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
11. **编辑式标题区**：`post-header` 外层 `max-w-5xl`（64rem）、内层 `max-w-[46rem]`，与下方 `.post-body` 的内层同宽同轴，标题左对齐。署名行只用文字 + 分隔点（作者 / 发布于 / 更新于 / 时长 / 不蒜子阅读量），**不得**加回图标署名或大号元信息；「编辑」「分享」是 ghost 入口（`min-h-11` 44px、hover `surface-muted`、无边框/实底）。标题（`h1`）首帧即最终可见状态（LCP 元素），不得加 framer 入场动画。文章封面固定 `rounded-micro`（4px 圆角，`aspect-16/10 → 16/8 → 21/9` 响应式），不得改回大圆角/白底卡片。`#busuanzi_page_pv` 锚点必须保留（Layout 的 `pingBusuanzi` 依赖它回填阅读量）。
12. **正文排版 Token 化**：`.post-prose.prose` 固定 `font-family: var(--font-sans)`、移动端 17px / 桌面（≥768px）18px、`line-height: 1.95`、列宽 46rem；h1/h2/h3/h4 字号与留白沿用 `.post-prose` 现有规则（h2 保留一条 `--color-border` 发丝线，h3 不描边），不得在组件里另写一套标题字号。段落、列表、引用、表格、行内 code、`kbd`、脚注、图片、代码块的颜色/间距/圆角必须使用设计 Token（`--color-*` / `--space-*` / `--radius-*` / `--duration-*`）；新增正文样式写在 `index.css` 的 `.post-prose` 区块，段落级规则同时覆盖 `:is(p, .md-paragraph)`。`prose` 插件的 `--tw-prose-*` 变量已统一映射到 Token，**不得**在 `Post.tsx` 里写死色值/px 绕过 Token。
13. **阅读模式排版**：`.reading-mode-article` 下正文 19px / 1.95（≤767px 为 18px）、列宽 44rem（`.post-body > div` 与 `.post-header` 同步收窄），段落间距 `--space-6`（移动 `--space-5`）；标题锚点偏移改用 `--space-8`。阅读模式会隐藏文末许可/作者/订阅/系列/相邻/相关/评论与标题区署名，只保留退出按钮与正文；`readingEndRef` 结尾哨兵在两种模式下都保留，保证阅读进度口径一致——**不得**改这两条宽度而不复核标题锚点与进度恢复。
14. **文末端顺序与轻量结构**：顺序固定为 许可（CC BY-SA）→ 作者/帮助改进 → 订阅卡 → 系列（有系列时）→ 相邻文章 → 相关文章 → 评论，**不得**重排/合并。许可、作者、相邻、相关区统一用 `border-t border-line` 的细线分区 + 低对比文字，视觉只减重；系列区是 `ol.divide-y divide-line` 的轻量列表（序号 + 标题 + 当前篇 `aria-current="page"`/「当前」标记 + 上/下一章），**不得**改回卡片网格或加大底色块。相邻/相关/评论的既有快捷键与组件（`GiscusComments`、`CompactPostCard`）保持不变。

## 常见陷阱

- 标题含图片/公式时渲染文本与 rawText 不一致 → 锚点错位（按既有 usedHeadingIds 兜底）；
- 修改 headings-core 的正则会影响构建期校验（锚点链接校验）；
- Post.tsx 体量极大，新增逻辑优先抽到 utils/组件，避免继续膨胀。
- 标题区与正文不同轴：外层 `max-w-5xl` 只是留白容器，内层 `max-w-[46rem]` 才与 `.post-body > div` 对齐；只改其中一层会看到标题/正文左缘错位（阅读模式还另有 44rem 收窄）。
- 正文样式只改 `prose` / `md:prose-lg` 工具类：typography 插件选择器特异性更高且可能在产物中后置，必须写在 `.post-prose.prose` 下才能稳定生效；删掉 `.prose` 这一级会静默失效。
- 在 `Post.tsx` 里给标题/正文加内联 `text-[18px]`、`text-zinc-*` 之类硬编码：与 `index.css` 的 Token 冲突，深浅两态/阅读模式会各错一半。
- 改阅读模式宽度或字号后没同步 `post-header` / 进度哨兵：标题与正文错轴、阅读进度恢复落点偏掉。
- 把文末分区改回大卡片/重边框，或把系列列表改成卡片网格：与定稿的轻量风格相反，`Post.test` 的文末顺序与系列结构断言会直接红。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
