/**
 * 首页推荐阅读小部件：按 `updatedAt || date` 降序取**最近更新的 3 篇**。
 *
 * 数据来自构建期内联的 `generated/posts.json`（`getHomeStats()` 内的 `featuredPosts`），
 * 渲染期不 fetch、不读时钟/随机值 —— 首页不出现「随机推荐」，否则 SSG 产物每次构建
 * 都会漂移、水合首帧也对不上。卡片只是导流入口：标题 + 标签 + 日期，不带摘要/封面，
 * 列表能力属于 `/posts`。
 */

import { Link } from 'react-router-dom';
import { formatDate } from '@/utils/date';
import { getHomeStats } from '@/services/homeStats';
import { Widget } from './Widget';

const formatMetaDate = (dateText: string) =>
  formatDate(dateText, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const FeaturedPostsWidget = () => {
  const { featuredPosts } = getHomeStats();

  return (
    <Widget
      id="home-featured"
      title="推荐阅读"
      index={3}
      className="lg:col-span-3 xl:col-span-3 xl:row-span-2"
      action={{ label: '看看文章', to: '/posts' }}
    >
      {featuredPosts.length > 0 ? (
        <ol className="flex flex-col gap-0.5">
          {featuredPosts.map((post, position) => (
            <li key={post.id} className="min-w-0">
              <Link
                to={`/post/${post.id}`}
                className="group -mx-2 flex min-w-0 gap-2.5 rounded-control px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
              >
                <span aria-hidden="true" className="mt-0.5 shrink-0 font-sans text-xs tabular-nums text-content-muted">
                  {String(position + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[13px] font-medium leading-relaxed text-content decoration-content-muted underline-offset-4 group-hover:underline">
                    {post.title}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-content-muted">
                    {post.excerpt}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-content-muted">
                    {post.tags[0] && (
                      <>
                        {post.tags[0]}
                        <span aria-hidden="true" className="px-1 opacity-40">
                          ·
                        </span>
                      </>
                    )}
                    {formatMetaDate(post.date)}
                    <span aria-hidden="true" className="px-1 opacity-40">
                      ·
                    </span>
                    {post.readTime}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-content-muted">还没有文章。</p>
      )}
    </Widget>
  );
};
