/**
 * Cookie 同意弹窗：屏幕中央的隐私说明，localStorage 持久化同意，
 * 关闭仅当前会话不提示；与其它弹层共享滚动锁与焦点陷阱。
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { acceptCookieConsent, dismissCookieConsent, hasCookieDecision } from '@/services/cookieConsent';

export const CookieNotice: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const acceptButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!hasCookieDecision()) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    acceptCookieConsent();
    setIsVisible(false);
  };

  const handleClose = () => {
    // 「关闭」≠「同意」：仅当前会话不再提示。
    dismissCookieConsent();
    setIsVisible(false);
  };

  useModalOverlay({
    isOpen: isVisible,
    onClose: handleClose,
    initialFocusRef: acceptButtonRef,
    containerRef: dialogRef,
  });

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
          className="cookie-notice fixed inset-0 z-modal flex items-center justify-center bg-black/65 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-notice-title"
            aria-describedby="cookie-notice-description"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
            className="max-h-[calc(100svh-2rem)] w-full max-w-2xl overflow-y-auto border border-line bg-surface p-6 shadow-2xl md:p-8"
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
