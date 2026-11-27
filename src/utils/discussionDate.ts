/**
 * 说说 / 留言板共用的时间与计数格式化。
 *
 * 为什么不用 utils/date.ts 的 formatDate：那边只吃 "YYYY-MM-DD"（本地时区解析），
 * Discussion 给的是 ISO 8601 时间戳（含时分与 Z）。这里按时区固定为 Asia/Shanghai
 * 输出「2026年11月13日 11:47」，SSG 与客户端水合结果一致（不依赖运行环境的本地时区，
 * 否则 CI（UTC）与访客（+08）会渲染出不同文本 → hydration mismatch）。
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const parse = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 「2026年11月13日」（日期无效时回退原串）。 */
export const formatDiscussionDate = (value: string): string => {
  const date = parse(value);
  if (!date) return value;
  try {
    return DATE_FORMATTER.format(date);
  } catch {
    return value;
  }
};

/** 「2026年11月13日 11:47」。 */
export const formatDiscussionDateTime = (value: string): string => {
  const date = parse(value);
  if (!date) return value;
  try {
    return `${DATE_TIME_FORMATTER.format(date)} ${TIME_FORMATTER.format(date)}`;
  } catch {
    return value;
  }
};

/** `<time>` 元素用的机器可读值（无效时返回空串，由调用方决定是否输出）。 */
export const toDateTimeAttr = (value: string): string => {
  const date = parse(value);
  return date ? date.toISOString() : '';
};
