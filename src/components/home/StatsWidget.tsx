/**
 * 首页统计卡小部件：只展示 Vercount 的站点总访问量与总访客数。
 *
 * 2026-11 用户确认精简：卡片里只保留 `site_pv`（总访问量）与 `site_uv`（总访客数）两项，
 * 「统计自 Vercount」缩成标题后的说明，构建期文章数与累计字数不再出现在这张卡里
 * （篇数在「写作档案」卡、本页阅读量在文章页）。Vercount 公开接口**没有「今日」维度** ——
 * 因此这里不出现「今日」字样，也不自行推算（推算会误导访客）。计数由 `Layout` 的路由级
 * `pingVercount` 上报后回填到 `#vercount_value_*` span；本组件挂载时再补一次缓存回填，
 * 避免 span 晚于上报完成时停在「加载中」。上报失败时服务层会把占位替换为「—」，不伪装成功。
 */

import { useEffect } from 'react';
import { Activity } from 'lucide-react';
import { fillVercountSpans } from '@/services/vercount';
import { Widget } from './Widget';

const METRICS = [
  { key: 'site_pv', label: '总访问量' },
  { key: 'site_uv', label: '总访客数' },
] as const;

export const StatsWidget = () => {
  // span 可能晚于 Layout 的上报完成才挂载：挂载时从模块缓存补一次（不发起请求、不计数）。
  useEffect(() => {
    fillVercountSpans();
  }, []);

  return (
    <Widget
      id="home-stats"
      title="访问统计"
      titleNote={
        <span className="inline-flex items-center gap-1">
          <Activity size={11} aria-hidden="true" className="opacity-70" />
          统计自 Vercount
        </span>
      }
      index={4}
      className="lg:col-span-3 xl:col-span-4"
    >
      {/* 卡片在桌面会被同行的名片卡拉高：数字成组垂直居中，留白上下均分。 */}
      <div className="flex flex-1 flex-col justify-center">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {METRICS.map((metric) => (
            <div key={metric.key} className="min-w-0">
              <dt className="text-[11px] text-content-muted">{metric.label}</dt>
              <dd className="mt-0.5">
                <span
                  id={`vercount_value_${metric.key}`}
                  className="font-sans text-lg font-bold leading-tight tracking-tight text-content tabular-nums sm:text-2xl"
                >
                  加载中
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Widget>
  );
};
