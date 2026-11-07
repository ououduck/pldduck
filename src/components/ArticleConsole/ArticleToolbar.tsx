/**
 * 移动端文章阅读工具栏（<1024px）：[目录] [进度] [分享] [阅读模式]。
 *
 * 减负版：去掉「更多」二级菜单与描边胶囊，收成一条无边框的 surface 小条；
 * 复制链接等低频操作由分享弹层承担（ShareModal 内仍有「仅复制链接」），
 * 底栏只保留四个高频入口，尽量不遮挡正文。
 * 悬浮位置沿用旧控件栈的偏移变量（tab-bar/cookie/update 提示/safe-area）。
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, List, Share2 } from 'lucide-react';

const TOOLBAR_BOTTOM_STYLE = {
  bottom:
    'calc(var(--tab-bar-height, 0px) + max(calc(env(safe-area-inset-bottom, 0px) + var(--cookie-notice-height, 0px) + var(--service-worker-prompt-height, 0px) + 1rem), calc(var(--cookie-notice-height, 0px) + var(--service-worker-prompt-height, 0px) + 1rem)))',
} as const;

const TOOLBAR_BUTTON_CLASS =
  'inline-flex h-11 w-11 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-muted hover:text-content active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

interface ArticleToolbarProps {
  percentage: number;
  headingsCount: number;
  onOpenToc: () => void;
  onShare: () => void;
  onToggleReadingMode: () => void;
}

export const ArticleToolbar: React.FC<ArticleToolbarProps> = ({
  percentage,
  headingsCount,
  onOpenToc,
  onShare,
  onToggleReadingMode,
}) => {
  // SSR/首帧不渲染（createPortal 需要 document）：挂载后一次性放出。
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  return createPortal(
    <div
      className="fixed left-1/2 z-floating -translate-x-1/2 lg:hidden"
      style={TOOLBAR_BOTTOM_STYLE}
      role="toolbar"
      aria-label="文章阅读工具"
    >
      <div className="flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-xl">
        <button
          type="button"
          onClick={onOpenToc}
          disabled={headingsCount === 0}
          className={TOOLBAR_BUTTON_CLASS}
          aria-label={headingsCount > 0 ? `打开文章目录（共 ${headingsCount} 节）` : '本文无目录'}
          title="目录"
        >
          <List size={16} aria-hidden="true" />
        </button>
        <span
          role="progressbar"
          aria-label="阅读进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          title="阅读进度"
          className="min-w-[2.25rem] text-center text-[11px] font-semibold tabular-nums text-content-muted"
        >
          {percentage}%
        </span>
        <button type="button" onClick={onShare} className={TOOLBAR_BUTTON_CLASS} aria-label="分享文章" title="分享">
          <Share2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleReadingMode}
          className={TOOLBAR_BUTTON_CLASS}
          aria-label="进入专注阅读"
          title="专注阅读"
        >
          <Eye size={16} aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body,
  );
};
