/**
 * 首页小部件外壳：统一卡片外观（surface 大色块 + 圆角 + 内边距）、标题层级与入场序号。
 *
 * 卡片外观只走既有 Token（`bg-surface` / `rounded-overlay` / `text-content-muted`），
 * 与全站卡片同一套配色。入场动画是纯 CSS：`data-home-reveal="card-N"` 决定
 * `--home-reveal-delay`（见 index.css），**不写内联动画样式**，SSR 首帧与水合首帧一致。
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export interface WidgetAction {
  label: string;
  to: string;
}

export interface WidgetProps {
  /** 卡片锚点 id，同时用于标题的 `aria-labelledby`（`${id}-title`）。 */
  id: string;
  /** 卡片标题；名片卡这类以 `<h1>` 为标题的卡片可省略。 */
  title?: string;
  /** 入场序号（1 起）：驱动 CSS 的 stagger，纯 CSS、无内联样式。 */
  index: number;
  /** 右上角的次要入口（站内跳转）。 */
  action?: WidgetAction;
  /** 网格跨列/跨行与卡片级微调。 */
  className?: string;
  /** 无视觉标题时提供可访问名称。 */
  ariaLabel?: string;
  children: React.ReactNode;
}

export const Widget: React.FC<WidgetProps> = ({ id, title, index, action, className, ariaLabel, children }) => {
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
      data-home-reveal={`card-${index}`}
      className={`home-widget home-reveal relative flex min-w-0 flex-col overflow-hidden rounded-overlay bg-surface p-5 sm:p-6${className ? ` ${className}` : ''}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-[11px] font-medium uppercase tracking-[0.18em] text-content-muted">
            {title}
          </h2>
          {action && (
            <Link
              to={action.to}
              className="group inline-flex min-h-6 shrink-0 items-center gap-1 rounded-micro text-[11px] text-content-muted transition-colors hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
            >
              {action.label}
              <ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
};

/** 小部件内的次要说明行（如统计卡底部的构建期数字）。 */
export const widgetMetaRowClassName = 'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content-muted';

/** 小部件内的主数值排版：阅读字体大号 + 等宽数字，保证数值变化时不抖动。 */
export const widgetValueClassName = 'font-sans text-2xl font-bold tracking-tight text-content tabular-nums';
