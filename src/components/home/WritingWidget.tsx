/**
 * 首页写作档案小部件：累计篇数、锚点年份篇数与近 12 个月的发表柱状图。
 *
 * 「近 12 个月」以**最新一篇文章的月份**为锚点（数据字段），不用 `Date.now()`：
 * 否则每构建一次产物就漂移、SSR 与客户端首帧也会对不上。UI 上显式写出锚点年份
 * （如「2026 年」），不把锚点年说成「今年」。柱状图是纯 CSS 高度，无图表库、
 * 无动画，`role="img"` + `aria-label` 给出可读摘要，图形本身对辅助技术隐藏。
 */

import { getHomeStats } from '@/services/homeStats';
import { formatDate } from '@/utils/date';
import { Widget, widgetValueClassName } from './Widget';

/** 柱高按当月篇数占最大值的比例换算；0 篇留一条发丝基线，避免空月份消失。 */
const BAR_MAX_HEIGHT_REM = 4;
const BAR_MIN_HEIGHT_REM = 0.25;

const formatStartDate = (dateText: string | null) => {
  if (!dateText) {
    return '';
  }
  return formatDate(dateText, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

export const WritingWidget = () => {
  const stats = getHomeStats();
  const { months, postCount, yearPostCount, anchorYear, firstPostDate } = stats;
  const maxCount = months.reduce((max, month) => Math.max(max, month.count), 0);
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const chartSummary =
    months.length > 0
      ? `${firstMonth.fullLabel}至${lastMonth.fullLabel}每月文章数：${months
          .map((month) => `${month.label}${month.count}篇`)
          .join('，')}`
      : '暂无按月统计';

  return (
    <Widget id="home-writing" title="写作档案" index={5} className="lg:col-span-3 xl:col-span-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] text-content-muted">累计</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className={widgetValueClassName}>{postCount}</span>
            <span className="text-[11px] text-content-muted">篇</span>
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[11px] text-content-muted">{anchorYear === null ? '本年' : `${anchorYear} 年`}</p>
          <p className="mt-0.5 flex items-baseline justify-end gap-1">
            <span className="font-sans text-lg font-semibold tabular-nums text-content">{yearPostCount}</span>
            <span className="text-[11px] text-content-muted">篇</span>
          </p>
        </div>
      </div>

      {months.length > 0 && (
        <div className="mt-auto pt-4">
          <div role="img" aria-label={chartSummary} className="flex h-16 items-end gap-1">
            {months.map((month) => {
              const height =
                month.count === 0
                  ? BAR_MIN_HEIGHT_REM
                  : Math.max((month.count / maxCount) * BAR_MAX_HEIGHT_REM, BAR_MIN_HEIGHT_REM);
              return (
                <span
                  key={month.key}
                  data-month={month.key}
                  style={{ height: `${height}rem` }}
                  className={`block flex-1 rounded-micro ${month.count === 0 ? 'bg-line' : 'bg-content'}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-content-muted">
            <span>{firstMonth.fullLabel}</span>
            <span>{lastMonth.fullLabel}</span>
          </div>
        </div>
      )}

      {firstPostDate && <p className="mt-3 text-[11px] text-content-muted">始于 {formatStartDate(firstPostDate)}</p>}
    </Widget>
  );
};
