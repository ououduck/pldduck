/**
 * 404 页：页面不存在提示（带当前路径调试信息），noindex。
 *
 * 视觉口径（2026-11）：全部改为**卡片式**，与站内栏目页一致 ——
 * 页头卡片（标题/说明/返回）→ 搜索卡片 → 入口卡片 → 最近文章卡片，
 * 不再使用发丝线分隔与浮空的浅水印 404。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Archive, BookOpen, Search, SearchIcon } from 'lucide-react';
import { NotFoundState } from '@/components/NotFoundState';
import { Seo } from '@/components/Seo';
import { getInitialPosts } from '@/services/posts';

/** 快速入口：与导航栏同字，卡片内以方块按钮呈现。 */
const QUICK_LINKS: Array<{ to: string; label: string; hint: string; Icon: typeof Archive }> = [
  { to: '/posts', label: '文章', hint: '全部文章', Icon: BookOpen },
  { to: '/archive', label: '归档', hint: '按时间浏览', Icon: Archive },
  { to: '/search', label: '搜索', hint: '站内全文搜索', Icon: Search },
];

export const NotFound: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // 调试路径不能在渲染期直接输出 location.pathname：SSG 用占位路由
  // /__missing__ 预渲染 404 页（scripts/ssg.mjs），客户端在真实未知路径
  // （如 /foo）水合时，若首帧直接渲染 location.pathname 会与 SSR 文本不一致
  // 触发水合警告。首帧输出占位符（两端一致），挂载后 effect 再写入真实路径。
  const [clientPath, setClientPath] = useState('—');
  const [searchQuery, setSearchQuery] = useState('');
  // 构建期内联的文章元数据（eager glob，SSG/客户端首帧一致）：推荐 3 篇最近文章。
  const recentPosts = useMemo(
    () =>
      getInitialPosts()
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt || b.date) - Date.parse(a.updatedAt || a.date))
        .slice(0, 3),
    [],
  );

  useEffect(() => {
    setClientPath(location.pathname);
  }, [location.pathname]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    // Layout.tsx 已渲染 <main> 包裹路由内容，此处不再嵌套 <main>。
    <div className="pb-12 md:pb-20">
      <Seo title="页面不存在" description="你访问的页面不存在，可能已经移动或删除。" noindex />
      <NotFoundState
        title="这篇文章跑路了"
        description="你访问的页面不存在，可能已经移动、重命名，或者链接本身已经失效。试试搜索，或者从下面的入口继续浏览。"
        backLabel="返回首页"
        debugLabel={`Path: ${clientPath}`}
      >
        {/* 搜索卡片：与页头卡片同一套圆角与底色，输入框走 editorial-input */}
        <section aria-label="站内搜索" className="mt-4 rounded-overlay bg-surface p-5 md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
            <SearchIcon size={15} aria-hidden="true" />
            搜索站内内容
          </h2>
          <form onSubmit={handleSearchSubmit} role="search" className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="not-found-search" className="sr-only">
              搜索本站内容
            </label>
            <input
              id="not-found-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入关键词，回车搜索"
              className="editorial-input flex-1"
              autoComplete="off"
            />
            <button type="submit" className="editorial-button-primary rounded-control active:scale-[0.98]">
              搜索
            </button>
          </form>
        </section>

        {/* 快速入口卡片 */}
        <nav aria-label="页面入口" className="mt-4 rounded-overlay bg-surface p-5 md:p-6">
          <h2 className="text-sm font-semibold text-content">常用入口</h2>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {QUICK_LINKS.map(({ to, label, hint, Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-11 items-center gap-2.5 rounded-control bg-surface-muted px-3 py-2.5 transition-colors hover:bg-surface"
              >
                <Icon size={16} aria-hidden="true" className="shrink-0 text-content-tertiary" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-content">{label}</span>
                  <span className="block truncate text-[11px] text-content-tertiary">{hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </nav>

        {recentPosts.length > 0 && (
          <section aria-labelledby="not-found-recent-heading" className="mt-4 rounded-overlay bg-surface p-5 md:p-6">
            <h2 id="not-found-recent-heading" className="text-sm font-semibold text-content">
              最近的文章
            </h2>
            <ul className="mt-2 flex flex-col">
              {recentPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    to={`/post/${post.id}`}
                    className="group flex min-h-11 items-center justify-between gap-3 rounded-control px-2 py-2 text-sm transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0 truncate text-content-muted transition-colors group-hover:text-content">
                      {post.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-content-tertiary">{post.date}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </NotFoundState>
    </div>
  );
};
