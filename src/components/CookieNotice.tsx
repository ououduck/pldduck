/**
 * Cookie 同意弹窗：屏幕中央的隐私说明，localStorage 持久化同意，
 * 关闭仅当前会话不提示；与其它弹层共享滚动锁与焦点陷阱。
 *
 * 跨内核（Safari/WebKit、Firefox/Gecko）布局约定：
 * - 遮罩层 `grid + overflow-y-auto`，对话框用 `m-auto` 居中：内容比视口高时
 *   `margin:auto` 会退化成顶对齐、由遮罩层滚动，不会像 `items-center` 那样把
 *   对话框上下同时挤出视口（顶部标题/关闭按钮点不到）。
 * - 限高先给 `100vh` 兜底，再用 `@supports (height:100svh)` 升级到 `svh`：
 *   Safari 15.4 / Firefox 101 之前的 `svh` 声明会被整条丢弃，裸写 `svh` 等于没有
 *   限高（本站其它弹层 SlideModal/TableOfContents/ImageViewer 也是这套两层写法）。
 *
 * 动效：本组件的入场/退场原先用 framer-motion（会把 motion chunk 拖进首屏关键路径），
 * 现在改用 CSS 动画（src/styles/motion-fallbacks.css），参数逐项对齐原实现 ——
 * 遮罩 0.18s 淡入淡出、对话框 0.2s 淡入/淡出 + scale(0.98) + translateY(8px)。
 * 退场时保持挂载、动画结束后再卸载；reduced-motion 下 0 时长直接卸载。
 * 弹层栈/滚动锁/焦点陷阱仍在点击那一刻释放（与原 AnimatePresence 行为一致：
 * 元素留在 DOM 里做退场，但 useModalOverlay 的 isOpen 已经为 false）。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { acceptCookieConsent, dismissCookieConsent, hasCookieDecision } from '@/services/cookieConsent';

/** 退场动画时长：取对话框的 0.2s（遮罩 0.18s），动画结束后再卸载。 */
export const COOKIE_NOTICE_EXIT_DURATION_MS = 200;

export const CookieNotice: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const acceptButtonRef = useRef<HTMLButtonElement | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasCookieDecision()) {
      setIsVisible(true);
    }
  }, []);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current === null) {
      return;
    }

    window.clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
  }, []);

  // 卸载时清掉退场计时器：不能在已卸载组件上 setState。
  useEffect(() => clearExitTimer, [clearExitTimer]);

  const closeWithExitAnimation = useCallback(() => {
    // 退场进行中（200ms 窗口）的重复关闭请求直接忽略，避免叠加计时器。
    if (isClosing) {
      return;
    }

    if (shouldReduceMotion) {
      // 减少动效：0 时长久，直接卸载。
      setIsVisible(false);
      return;
    }

    setIsClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setIsClosing(false);
      setIsVisible(false);
    }, COOKIE_NOTICE_EXIT_DURATION_MS);
  }, [isClosing, shouldReduceMotion]);

  const handleAccept = useCallback(() => {
    acceptCookieConsent();
    closeWithExitAnimation();
  }, [closeWithExitAnimation]);

  const handleClose = useCallback(() => {
    // 「关闭」≠「同意」：仅当前会话不再提示。
    dismissCookieConsent();
    closeWithExitAnimation();
  }, [closeWithExitAnimation]);

  useModalOverlay({
    // 退场动画期间即释放弹层栈/滚动锁（原实现 AnimatePresence 也只在 isVisible
    // 为 true 时锁定，元素留在 DOM 里播完退场动画）。
    isOpen: isVisible && !isClosing,
    onClose: handleClose,
    initialFocusRef: acceptButtonRef,
    containerRef: dialogRef,
  });

  if (!isVisible) {
    return null;
  }

  // reduced-motion 下不加动画类（CSS 侧另有媒体查询兜底，双保险）。
  const overlayMotionClass = shouldReduceMotion ? '' : isClosing ? ' cookie-overlay-out' : ' cookie-overlay-in';
  const dialogMotionClass = shouldReduceMotion ? '' : isClosing ? ' cookie-dialog-out' : ' cookie-dialog-in';

  return (
    <div
      className={`cookie-notice fixed inset-0 z-modal grid overflow-y-auto overscroll-contain bg-black/65 p-4${overlayMotionClass}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-notice-title"
        aria-describedby="cookie-notice-description"
        className={`m-auto max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto border border-line bg-surface p-6 shadow-2xl supports-[height:100svh]:max-h-[calc(100svh-2rem)] md:p-8${dialogMotionClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cookie-notice-title" className="text-lg font-semibold tracking-tight text-content md:text-xl">
              Cookie 与隐私
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-line text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
            aria-label="关闭 Cookie 使用说明"
          >
            <X size={18} />
          </button>
        </div>

        <p
          id="cookie-notice-description"
          className="mt-3 text-[13px] leading-6 text-content-muted md:text-sm md:leading-7"
        >
          本站使用必要的本地存储记住你的偏好，并使用 Clarity 与 Vercount 统计了解访问情况；评论由 Giscus
          承载。继续浏览即表示你了解上述处理方式，也可以先阅读
          <Link
            to="/privacy"
            onClick={handleClose}
            className="mx-1 font-medium text-content underline decoration-line underline-offset-4 transition-colors hover:decoration-content"
          >
            隐私政策
          </Link>
          了解数据如何处理。
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex min-h-10 items-center justify-center border border-line px-4 text-sm font-medium text-content-muted transition-colors hover:bg-surface-muted hover:text-content"
          >
            仅浏览
          </button>
          <button
            ref={acceptButtonRef}
            type="button"
            onClick={handleAccept}
            className="inline-flex min-h-10 items-center justify-center bg-content px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
          >
            同意
          </button>
        </div>
      </div>
    </div>
  );
};
