/**
 * 共享元素转场名：让列表里的封面与详情页的大图在原生 View Transition 中
 * 「一镜到底」地连续变形（Vue / Nuxt 里 materialize 的那类效果），
 * 而不是旧页面淡出、新页面淡入。
 *
 * 实现约束（务必遵守，否则水合或布局会出问题）：
 * - 只有「同一个元素在前后两个视图里都存在」时才配同一对名字：列表卡片封面
 *   ↔ 文章详情页的封面。列表里**同一时刻只能有一个元素**带某个名字，
 *   因此只给当前展示形态的封面命名（banner/featured/card 三者互斥）。
 *   说说没有逐条页面，故不参与共享转场（见 ai-rules/shuoshuo.md）。
 * - 名字必须能区分具体条目（`post-cover-<id>`），否则从 A 卡片点进 B 文章时
 *   封面会从 A 的图变形过去，视觉上是错误的。
 * - 详情页首帧（SSR 输出）也要带同一个名字：SSG 直访时没有「旧视图」，
 *   浏览器会退化成单纯的新视图淡入，不影响可读性。
 * - `view-transition-name` 不参与渲染差异，因此在 SSG/客户端首帧渲染同一值，
 *   不构成水合不一致。
 */

/** 文章卡片封面 ↔ 文章详情页封面的共享转场名。 */
export const postCoverTransitionName = (postId: string): string =>
  `post-cover-${String(postId).replace(/[^A-Za-z0-9_-]/g, '-')}`;

/**
 * 转场样式：仅在客户端水合后、且浏览器支持 View Transitions 时才下发，
 * 服务端渲染阶段返回 undefined（SSR 输出里不出现任何转场相关内联样式）。
 *
 * @param name 转场名；传 null/undefined 表示该元素不参与共享转场
 * @param enabled 是否启用（由调用方传入「水合完成且支持 View Transitions」）
 */
export const viewTransitionStyle = (
  name: string | null | undefined,
  enabled: boolean,
): { viewTransitionName: string } | undefined => (enabled && name ? { viewTransitionName: name } : undefined);
