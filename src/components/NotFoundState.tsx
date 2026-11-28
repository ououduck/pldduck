/**
 * 404 状态块：标题/描述/返回入口，可选 debugLabel 展示调试信息（404 与文章缺失页共用）。
 * children 渲染在返回按钮之后，供 404 页扩展搜索/推荐等模块。
 *
 * 视觉口径（2026-11）：与全站栏目页统一为**卡片式** —— 页头一块 `rounded-overlay
 * bg-surface`，不再用「浮在页面上的浅水印 404 + 发丝线」那套轻量排版。
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface NotFoundStateProps {
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
  debugLabel?: string;
  children?: React.ReactNode;
}

export const NotFoundState: React.FC<NotFoundStateProps> = React.memo(
  ({ title, description, backTo = '/', backLabel = '返回首页', debugLabel, children }) => {
    return (
      <div className="mx-auto max-w-3xl pt-6 md:pt-10">
        <header className="rounded-overlay bg-surface p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">404</p>
          <h1 className="mt-2 font-sans text-3xl font-bold tracking-tight text-content md:text-4xl">{title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-content-muted md:text-base">{description}</p>

          {debugLabel && (
            <p className="mt-4 max-w-full font-mono text-[11px] leading-6 text-content-tertiary [overflow-wrap:anywhere]">
              {debugLabel}
            </p>
          )}

          <div className={children ? 'mt-5' : 'mt-5 flex flex-wrap gap-3'}>
            <Link
              to={backTo}
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-content transition-colors hover:border-accent hover:bg-surface-muted"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {backLabel}
            </Link>
          </div>
        </header>

        {children}
      </div>
    );
  },
);
