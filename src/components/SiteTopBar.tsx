/**
 * 内容列顶部的细顶栏：抽屉入口 + 当前页名 + 搜索与主题切换。
 *
 * 保留 `site-navbar` 类名：文章标题锚点偏移（--article-heading-offset）由
 * Layout 实测该元素高度得出，滚动定位的多个消费方都依赖这个类名。
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import { assetUrl } from '@/utils/siteUrl';
import { siteConfig } from '@config/site.config';
import { resolveNavLabel } from './siteNav';
import { ThemeToggle } from './ThemeToggle';

interface SiteTopBarProps {
  pathname: string;
  mobileNavOpen: boolean;
  mobileNavAnimating: boolean;
  onToggleMobileNav: () => void;
  onSearchNavigate: () => void;
}

export const SiteTopBar: React.FC<SiteTopBarProps> = ({
  pathname,
  mobileNavOpen,
  mobileNavAnimating,
  onToggleMobileNav,
  onSearchNavigate,
}) => {
  const pageLabel = resolveNavLabel(pathname) ?? siteConfig.title;

  return (
    <nav
      aria-label="页面导航"
      className="site-navbar sticky top-0 z-nav border-b border-zinc-200/80 bg-paper px-3 dark:border-zinc-800/80 dark:bg-void sm:px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex min-h-14 items-center gap-2 sm:min-h-16">
        <button
          type="button"
          id="mobile-nav-menu-button"
          onClick={onToggleMobileNav}
          disabled={mobileNavAnimating}
          aria-controls="mobile-navigation-panel"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? '收起导航菜单' : '打开导航菜单'}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-icon border border-zinc-300 text-zinc-600 transition-colors hover:border-zinc-500 hover:bg-zinc-100 hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white lg:hidden"
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* 移动端顶栏品牌：lg 以下侧栏不显示，站名回到顶栏承担回首页入口 */}
        <Link to="/" className="flex min-w-0 items-center gap-2 lg:hidden" aria-label={`${siteConfig.title} 首页`}>
          <img
            src={assetUrl(siteConfig.logoSmall)}
            alt=""
            width={28}
            height={28}
            fetchPriority="auto"
            className="h-7 w-7 shrink-0 rounded-full bg-white object-cover"
          />
          <span className="truncate font-serif text-lg font-bold tracking-tight text-ink dark:text-white">
            {siteConfig.title}
          </span>
        </Link>

        <p className="hidden min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400 lg:block">
          {pageLabel}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={onSearchNavigate}
            className="inline-flex h-11 w-11 items-center justify-center rounded-icon border border-zinc-300 bg-zinc-100 text-ink transition-colors hover:border-zinc-500 hover:bg-zinc-200 active:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            aria-label="打开搜索页"
          >
            <Search size={18} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
};

export default SiteTopBar;
