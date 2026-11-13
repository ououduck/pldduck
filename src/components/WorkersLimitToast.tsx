/**
 * Workers 每日请求上限的全局提示：状态 API 返回 HTTP 1027/429 时从顶部弹出，
 * 固定文案 + 红色感叹号，3 秒后自动收回（没有关闭按钮）。
 *
 * - 只订阅 siteStatusStore 的 workersLimit 事件（10 分钟节流在 store 内完成），
 *   组件自己不请求状态，也不缓存结果；
 * - 轻量克制：不做持续动画/闪烁，只有 150ms 一次性透明度淡入（CSS 动画
 *   `.toast-fade-in`，见 src/styles/motion-fallbacks.css；无位移，
 *   因此 prefers-reduced-motion 下也不需要额外的位移动画分支）；
 * - 挂在 AppShell 内的 ErrorBoundary 里，所有页面、阅读模式与手机端都能提示；
 * - z-index 高于顶栏（nav=50）/侧栏（60）/移动抽屉（85）、低于 modal（100），
 *   保证不遮挡命令面板、分享弹层等模态层；
 * - 纯提示无交互：pointer-events-none 不拦截下方点击；顶部偏移含 safe-area，
 *   宽度受视口约束（移动端不溢出）。
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { subscribeWorkersLimit } from '@/services/siteStatusStore';

/** 固定文案（用户已确认，逐字使用，不得改写）。 */
export const WORKERS_LIMIT_MESSAGE = '今日 Workers 请求次数达到上限，部分功能受限';

/** 顶部停留时长：3 秒后自动收回。 */
export const WORKERS_LIMIT_TOAST_DURATION_MS = 3000;

export const WorkersLimitToast: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const unsubscribe = subscribeWorkersLimit(() => {
      // 连续触发（多页签或补刷先后命中）时重新计时，避免旧 timer 提前收回新提示。
      clearHideTimer();
      setVisible(true);
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        setVisible(false);
      }, WORKERS_LIMIT_TOAST_DURATION_MS);
    });

    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="alert"
      className="toast-fade-in pointer-events-none fixed inset-x-3 top-[max(calc(env(safe-area-inset-top,0px)+4.25rem),4.25rem)] z-[90] mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-control border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950/90 dark:text-red-100 sm:top-[max(calc(env(safe-area-inset-top,0px)+4.75rem),4.75rem)]"
    >
      <AlertCircle size={16} aria-hidden="true" className="shrink-0 text-red-600 dark:text-red-400" />
      <span>{WORKERS_LIMIT_MESSAGE}</span>
    </div>
  );
};
