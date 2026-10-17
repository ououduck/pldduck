/**
 * 侧边导航主体：桌面端常驻左栏与移动端左滑抽屉共用同一份渲染，
 * 清单来自 `siteNav.ts`（单一数据源，杜绝两份导航清单漂移）。
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
import { assetUrl } from '@/utils/siteUrl';
import { siteConfig } from '@config/site.config';
import { preloadPage } from '@/utils/preload';
import { isNavItemActive, navGroups } from './siteNav';

const ACTIVE_ROW_CLASS = 'bg-zinc-900 text-paper dark:bg-zinc-100 dark:text-zinc-900';
const IDLE_ROW_CLASS =
  'text-zinc-600 hover:bg-zinc-100/80 hover:text-ink dark:text-zinc-300 dark:hover:bg-zinc-900/80 dark:hover:text-white';

interface SiteNavListProps {
  pathname: string;
  /** 传入时路径项渲染为 button（抽屉需要在关闭动画结束后再导航），否则渲染为 Link。 */
  onSelectPath?: (path: string) => void;
  /** 外链项点击时通知宿主（抽屉借此收起面板）；不传则保持默认跳转。 */
  onExternalClick?: () => void;
  /** 抽屉动画进行中禁用点击（与既有 isMobileNavAnimating 守卫一致）。 */
  interactionDisabled?: boolean;
  /** 分组无障碍名前缀，避免桌面栏与抽屉同时挂载时标签重名。 */
  labelPrefix?: string;
}

const SiteNavList: React.FC<SiteNavListProps> = ({
  pathname,
  onSelectPath,
  onExternalClick,
  interactionDisabled,
  labelPrefix = '',
}) => (
  <div className="flex flex-col gap-4">
    {navGroups.map((group) => (
      <div key={group.label}>
        <p className="sidebar-nav-group-title mb-1.5 truncate px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
          {group.label}
        </p>
        <nav aria-label={`${labelPrefix}${group.label}`}>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = 'path' in item && isNavItemActive(item.path, pathname);
              const rowClass = `nav-item flex min-w-0 items-center gap-2.5 rounded-control px-2 py-2 text-sm font-semibold transition-colors ${
                isActive ? ACTIVE_ROW_CLASS : IDLE_ROW_CLASS
              }`;
              const label = <span className="nav-item-label min-w-0 flex-1 truncate">{item.label}</span>;
              const hint = (
                <span className="nav-item-hint max-w-[46%] shrink-0 truncate text-right text-[10px] font-normal opacity-70">
                  {item.hint}
                </span>
              );

              if ('path' in item) {
                const content = (
                  <>
                    <span className="sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    {label}
                    {hint}
                  </>
                );

                if (onSelectPath) {
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => onSelectPath(item.path)}
                        disabled={interactionDisabled}
                        aria-current={isActive ? 'page' : undefined}
                        className={`${rowClass} w-full text-left disabled:cursor-not-allowed`}
                      >
                        {content}
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={item.key}>
                    <Link
                      to={item.path}
                      onMouseEnter={() => preloadPage(item.path)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`${rowClass} w-full`}
                    >
                      {content}
                    </Link>
                  </li>
                );
              }

              const opensNewTab = item.newTab !== false;

              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    {...(opensNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={onExternalClick}
                    className={`${rowClass} w-full`}
                  >
                    <span className="sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    {label}
                    {opensNewTab ? (
                      <ExternalLink size={11} aria-hidden="true" className="nav-item-external shrink-0 opacity-60" />
                    ) : (
                      hint
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    ))}
  </div>
);

/** 品牌头：头像 + 站名 + 作者身份，整体可点回首页（抽屉内改走关闭动画）。 */
const SidebarBrand: React.FC<{ onSelectPath?: (path: string) => void; interactionDisabled?: boolean }> = ({
  onSelectPath,
  interactionDisabled,
}) => {
  const content = (
    <>
      <img
        src={assetUrl(siteConfig.logoSmall)}
        alt=""
        width={28}
        height={28}
        fetchPriority="auto"
        className="sidebar-avatar h-7 w-7 shrink-0 rounded-full bg-white object-cover"
      />
      <span className="sidebar-brand-text min-w-0 flex-1">
        <span className="block truncate font-serif text-base font-bold tracking-tight text-ink dark:text-white">
          {siteConfig.title}
        </span>
        <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          {siteConfig.author.role}
        </span>
      </span>
    </>
  );

  if (onSelectPath) {
    return (
      <button
        type="button"
        onClick={() => onSelectPath('/')}
        disabled={interactionDisabled}
        aria-label={`${siteConfig.title} 首页`}
        className="sidebar-brand flex w-full min-w-0 items-center gap-2.5 rounded-control py-1 pl-2 text-left transition-colors hover:bg-zinc-100/80 disabled:cursor-not-allowed dark:hover:bg-zinc-900/80"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to="/"
      aria-label={`${siteConfig.title} 首页`}
      className="sidebar-brand flex min-w-0 items-center gap-2.5 rounded-control py-1 pl-2 transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80"
    >
      {content}
    </Link>
  );
};

const SidebarFooter = () => (
  <div className="sidebar-footer mt-5 border-t border-zinc-200/80 pt-4 text-[11px] leading-5 text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
    <p className="truncate">
      {siteConfig.footerText} · {siteConfig.author.name}
    </p>
  </div>
);

export interface SiteSidebarBodyProps extends SiteNavListProps {
  onClose?: () => void;
}

/** 侧栏与抽屉共用的内容体：品牌头 → 导航清单 → 站点页脚。 */
export const SiteSidebarBody: React.FC<SiteSidebarBodyProps> = ({ onClose, ...navProps }) => (
  <div className="flex min-w-0 flex-col">
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <SidebarBrand onSelectPath={navProps.onSelectPath} interactionDisabled={navProps.interactionDisabled} />
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭导航菜单"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-icon text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-ink active:scale-[0.98] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          <X size={18} />
        </button>
      ) : null}
    </div>

    <div className="mt-4">
      <SiteNavList {...navProps} />
    </div>

    <SidebarFooter />
  </div>
);

/**
 * 桌面端常驻左栏：lg 以上显示。外层只占图标条宽度（正文据此让位）并作为定位上下文，
 * 内层 `.site-sidebar-inner` 是绝对定位浮层，静置态同宽、鼠标移入或键盘聚焦时由 CSS
 * 展开到完整宽度盖在正文之上 —— 见 index.css 的侧边导航区块。
 */
export const SiteSidebar: React.FC<{ pathname: string }> = ({ pathname }) => (
  <aside
    id="site-sidebar"
    aria-label="站点导航"
    className="site-sidebar sticky top-0 z-sidebar hidden h-screen shrink-0 self-start lg:block"
  >
    <div
      className="site-sidebar-inner flex flex-col border-r border-zinc-200/80 bg-paper no-scrollbar dark:border-zinc-800/80 dark:bg-void"
      style={{
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        // 右边框占掉 1px，扣掉它才能让行高亮块与图标同轴落在 rail 中心线上
        paddingRight: 'calc(0.5rem - 1px)',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',
      }}
    >
      <SiteSidebarBody pathname={pathname} labelPrefix="侧边栏" />
    </div>
  </aside>
);
