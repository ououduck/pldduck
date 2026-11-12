/**
 * 首页标签云小部件：按文章数降序的热门标签，点击进入文章列表的标签筛选。
 *
 * 标签由构建期文章元数据汇总（`getHomeStats().tags`），不读时钟/随机值。
 * 链接统一指向 `/posts?tag=<encodeURIComponent>`，筛选与排序逻辑仍在 `/posts`。
 */

import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';
import { getHomeStats } from '@/services/homeStats';
import { Widget } from './Widget';

export const TagsWidget = () => {
  const { tags, tagCount } = getHomeStats();

  return (
    <Widget
      id="home-tags"
      title="标签"
      index={6}
      className="lg:col-span-3 xl:col-span-4"
      action={{ label: '全部标签', to: '/posts' }}
    >
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag.name} className="min-w-0">
              <Link
                to={`/posts?tag=${encodeURIComponent(tag.name)}`}
                className="group inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-control bg-surface-muted px-2.5 text-[12px] text-content-muted transition-colors hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
              >
                <Tag size={11} aria-hidden="true" className="shrink-0 opacity-60" />
                <span className="truncate">{tag.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums opacity-60">{tag.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-content-muted">还没有标签。</p>
      )}

      {tagCount > tags.length && (
        <p className="mt-auto pt-4 text-[11px] text-content-muted">
          共 {tagCount} 个标签，卡片只展示前 {tags.length} 个。
        </p>
      )}
    </Widget>
  );
};
