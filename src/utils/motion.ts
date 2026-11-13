/**
 * 全站统一的 cubic-bezier 缓动曲线（供仍使用 framer-motion 的交互后弹层/列表使用）。
 *
 * easeOut — 强减速（0.16, 1, 0.3, 1）：入场末段极缓，适合卡片/列表显隐。
 * easeSmooth — 柔和过渡（0.22, 1, 0.36, 1）：比 easeOut 更平缓，适合状态过渡。
 * 两者均为标准 ease-out（y 控制点不越过 1，无回弹），配合无位移动画，减少重排感。
 *
 * 注：路由切换的进入淡入已移出 framer-motion（原先的 routeTransition 变体随之删除），
 * 改由 src/styles/motion-fallbacks.css 的 `.route-content-fade-in` 实现，
 * 时长/曲线与 easeSmooth 一致；easeSmooth 仍保留给后续 framer 过渡复用。
 */

export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeSmooth = [0.22, 1, 0.36, 1] as const;
