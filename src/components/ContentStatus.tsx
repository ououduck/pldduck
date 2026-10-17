/**
 * 内容状态展示：空态/错误态提示（含操作按钮），配合 LoadingStatus 覆盖列表类页面的加载与结果态。
 */

import React from 'react';
import { mergeClassName } from '@/utils/classNames';

type ContentStatusVariant = 'empty' | 'error';

interface ContentStatusProps {
  title: string;
  description?: string;
  variant?: ContentStatusVariant;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const ContentStatus: React.FC<ContentStatusProps> = ({
  title,
  description,
  variant = 'empty',
  actionLabel,
  onAction,
  className,
}) => (
  <div
    role={variant === 'error' ? 'alert' : 'status'}
    className={mergeClassName(
      'border-y px-3 py-10 text-center sm:px-6',
      variant === 'error'
        ? 'border-dashed border-zinc-500 dark:border-zinc-500'
        : 'border-zinc-200 dark:border-zinc-800',
      className,
    )}
  >
    <p
      className={mergeClassName(
        'text-lg font-semibold',
        variant === 'error' ? 'text-zinc-950 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300',
      )}
    >
      {title}
    </p>
    {description && <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p>}
    {actionLabel && onAction && (
      <button type="button" onClick={onAction} className="editorial-button mt-4 rounded-control active:scale-[.98]">
        {actionLabel}
      </button>
    )}
  </div>
);

interface LoadingStatusProps {
  label: string;
  className?: string;
  /** 页面级加载（路由 chunk 下载中）在字样下补一条扫过的发丝线；列表内嵌用默认的行内态。 */
  withRule?: boolean;
}

export const LoadingStatus: React.FC<LoadingStatusProps> = ({ label, className, withRule = false }) => (
  <div
    role="status"
    aria-live="polite"
    className={mergeClassName(
      'flex flex-col items-center justify-center gap-2.5 py-6 text-zinc-400 dark:text-zinc-500',
      className,
    )}
  >
    <span className="duck-loader-group">
      <span className="duck-loader" aria-hidden="true">
        <span className="duck-loader-steps">
          <i className="duck-loader-step" />
          <i className="duck-loader-step" />
          <i className="duck-loader-step" />
        </span>
        {/* tracking 会在末字后留一个字距的空隙，用等值负外边距抵掉，字样才真正居中 */}
        <span className="duck-loader-word -mr-[0.32em] select-none font-serif text-[11px] font-bold italic uppercase leading-none tracking-[0.32em]">
          PLDDUCK
        </span>
      </span>
      {withRule && <i className="duck-loader-rule" aria-hidden="true" />}
    </span>
    <span className="text-sm">{label}</span>
  </div>
);
