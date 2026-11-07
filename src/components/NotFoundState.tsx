/**
 * 404 状态块：标题/描述/返回入口，可选 debugLabel 展示调试信息（404 与文章缺失页共用）。
 * children 渲染在返回按钮之后，供 404 页扩展搜索/推荐等模块。
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
      <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-1 py-12 md:py-16">
        <div className="relative w-full">
          {/* 极轻水印：只作为版式背景，不占布局、不使用重色块。 */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-9 hidden select-none font-serif text-7xl font-black leading-none text-zinc-200/80 dark:text-zinc-800/70 md:-top-12 md:block md:text-8xl"
          >
            404
          </span>

          <div className="relative">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-content md:text-4xl">{title}</h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-content-muted md:text-base">{description}</p>

            {debugLabel && (
              <p className="mt-5 max-w-full font-mono text-xs leading-6 text-zinc-400 [overflow-wrap:anywhere] dark:text-zinc-500">
                {debugLabel}
              </p>
            )}

            <div className={children ? 'mt-7' : 'mt-7 flex flex-wrap gap-3'}>
              <Link
                to={backTo}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-sm font-medium text-content transition-colors hover:border-zinc-400 hover:bg-surface-muted dark:hover:border-zinc-600"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                {backLabel}
              </Link>
            </div>

            {children}
          </div>
        </div>
      </div>
    );
  },
);
