/**
 * 共享元素转场开关：只有「浏览器支持 View Transitions + 客户端已水合 + 用户未要求减少动效」
 * 三者同时成立时才启用，避免 SSR 输出与客户端首帧出现差异（水合不一致），
 * 也避免在 reduced-motion 下做跨页面变形。
 *
 * 实现要点：
 * - 首帧固定返回 false（与服务端一致），挂载后由 effect 纠正 —— 与全站
 *   useMediaQuery / useReducedMotion 的既有约定相同；
 * - 数值只在拿到结果后变化一次（false → true），不会来回抖动。
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

const supportsViewTransition = (): boolean =>
  typeof document !== 'undefined' && typeof (document as Document).startViewTransition === 'function';

export const useSharedElementTransition = (): boolean => {
  const shouldReduceMotion = useReducedMotion();
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(supportsViewTransition());
  }, []);

  return isSupported && !shouldReduceMotion;
};
