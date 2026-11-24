/**
 * 消息时间：今天、昨天与跨天日期格式。
 */
import { describe, expect, it } from 'vitest';
import { formatMessageDay, formatMessageTime, isSameMessageDay } from './message-time';

const now = new Date(2026, 10, 24, 12, 0, 0).getTime();
const today = new Date(2026, 10, 24, 18, 30, 0).getTime();
const yesterday = new Date(2026, 10, 23, 18, 30, 0).getTime();
const earlier = new Date(2026, 10, 20, 18, 30, 0).getTime();

describe('message time', () => {
  it('uses time only for today', () => {
    expect(formatMessageTime(today, 'zh-CN', now)).toBe('18:30');
    expect(formatMessageDay(today, 'zh-CN', now)).toBe('今天');
  });

  it('marks yesterday in message time and date labels', () => {
    expect(formatMessageTime(yesterday, 'zh-CN', now)).toBe('昨天 18:30');
    expect(formatMessageDay(yesterday, 'zh-CN', now)).toBe('昨天');
  });

  it('includes a date for older messages', () => {
    expect(formatMessageTime(earlier, 'zh-CN', now)).toContain('18:30');
    expect(formatMessageTime(earlier, 'zh-CN', now)).not.toBe('18:30');
    expect(formatMessageDay(earlier, 'zh-CN', now)).not.toBe('今天');
  });

  it('compares local calendar days', () => {
    expect(isSameMessageDay(today, yesterday)).toBe(false);
    expect(isSameMessageDay(today, new Date(2026, 10, 24, 23, 59).getTime())).toBe(true);
  });

  it('uses the active locale', () => {
    expect(formatMessageDay(yesterday, 'en-US', now, 'Today', 'Yesterday')).toBe('Yesterday');
    expect(formatMessageTime(today, 'en-US', now)).toContain('18:30');
  });
});
