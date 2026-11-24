/**
 * 消息时间展示：按本地日期区分今天、昨天与更早日期。
 */

import type { AppLanguage } from '@shared/ipc/contracts';

const startOfDay = (value: number): number => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * 判断两个时间是否属于同一本地自然日。
 */
export const isSameMessageDay = (left: number, right: number): boolean =>
  startOfDay(left) === startOfDay(right);

/**
 * 消息日期的分隔文案。
 */
export const formatMessageDay = (
  timestamp: number,
  locale: AppLanguage,
  now = Date.now(),
  todayLabel = '今天',
  yesterdayLabel = '昨天'
): string => {
  const target = startOfDay(timestamp);
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === today) return todayLabel;
  if (target === yesterday.getTime()) return yesterdayLabel;
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (new Date(timestamp).getFullYear() !== new Date(now).getFullYear()) {
    options.year = 'numeric';
  }
  return new Intl.DateTimeFormat(locale, options).format(timestamp);
};

/**
 * 消息操作栏时间：今天只显示时分，昨天和更早显示日期上下文。
 */
export const formatMessageTime = (
  timestamp: number,
  locale: AppLanguage,
  now = Date.now(),
  todayLabel = '今天',
  yesterdayLabel = '昨天'
): string => {
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(timestamp);
  const target = startOfDay(timestamp);
  const today = startOfDay(now);
  if (target === today) return time;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === yesterday.getTime()) return `${yesterdayLabel} ${time}`;
  const day = formatMessageDay(timestamp, locale, now, todayLabel, yesterdayLabel);
  return `${day} ${time}`;
};
