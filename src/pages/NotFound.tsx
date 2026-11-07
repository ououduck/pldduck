/**
 * 404 页：页面不存在提示（带当前路径调试信息），noindex。
 * 提供站内搜索输入框、快速入口与最近文章推荐，风格延续站点 editorial 视觉。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { NotFoundState } from '@/components/NotFoundState';
import { Seo } from '@/components/Seo';
import { getInitialPosts } from '@/services/posts';

export const NotFound: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // 调试路径不能在渲染期直接输出 location.pathname：SSG 用占位路由
  // /__missing__ 预渲染 404 页（scripts/ssg.mjs），构建后再把静态 HTML 中
  // 的 /__missing__ 替换为 / —— 客户端在真实未知路径（如 /foo）水合时，
  // 若首帧直接渲染 location.pathname 会与 SSR 文本不一致触发水合警告。
  // 首帧输出占位符（两端一致），挂载后 effect 再写入真实路径。
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
    // Layout.tsx 已渲染 <main> 包裹路由内容，此处不再嵌套 <main>（HTML 规范禁止
    // main 嵌套 main，无障碍工具对嵌套 landmark 解析混乱）。
    <div>
      <Seo title="页面不存在" description="你访问的页面不存在，可能已经移动或删除。" noindex />
      <NotFoundState
        title="这篇文章跑路了 🏃"
        description="你访问的页面不存在，可能已经移动、重命名，或者链接本身已经失效。试试搜索，或者从下面的入口继续浏览。"
        backLabel="返回首页"
        debugLabel={`Path: ${clientPath}`}
      >
        {/* 站内搜索：发丝线下划线输入，回车进入搜索页；不再使用重描边输入框/按钮。 */}
        <form onSubmit={handleSearchSubmit} role="search" className="mt-8 max-w-md">
          <label htmlFor="not-found-search" className="sr-only">
            搜索本站内容
          </label>
          <div className="flex items-center gap-3 border-b border-line pb-1 transition-colors focus-within:border-zinc-400 dark:focus-within:border-zinc-600">
            <Search size={15} aria-hidden="true" className="shrink-0 text-zinc-400 dark:text-zinc-500" />
            <input
              id="not-found-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入关键词…"
              className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-content outline-none placeholder:text-zinc-400 sm:text-sm dark:placeholder:text-zinc-500"
              autoComplete="off"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-content-muted transition-colors hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
              aria-label="搜索"
            >
              搜索
            </button>
          </div>
        </form>

        {/* 快速入口：轻量文字链接 + 发丝线 */}
        <nav
          aria-label="页面入口"
          className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-4 text-sm"
        >
          <Link
            to="/archive"
            className="inline-flex min-h-11 items-center text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
          >
            归档
          </Link>
          <Link
            to="/tags"
            className="inline-flex min-h-11 items-center text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
          >
            标签
          </Link>
          <Link
            to="/search"
            className="inline-flex min-h-11 items-center text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
          >
            进入搜索页
          </Link>
        </nav>

        {recentPosts.length > 0 && (
          <section aria-labelledby="not-found-recent-heading" className="mt-8 max-w-md">
            <h2 id="not-found-recent-heading" className="mb-2 font-serif text-xl font-bold tracking-tight text-content">
              最近的文章
            </h2>
            <ul className="border-t border-line">
              {recentPosts.map((post) => (
                <li key={post.id} className="border-b border-line last:border-b-0">
                  <Link
                    to={`/post/${post.id}`}
                    className="group flex min-h-11 items-center justify-between gap-3 py-2 text-sm transition-colors"
                  >
                    <span className="min-w-0 truncate text-content-muted transition-colors group-hover:text-content">
                      {post.title}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">{post.date}</span>
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
