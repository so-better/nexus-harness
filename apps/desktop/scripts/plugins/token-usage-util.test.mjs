// @vitest-environment jsdom
/**
 * token-usage 插件纯逻辑测试：格式化、文案与主题模式。
 * 通过 vitest 别名把 `nexus/*` 映射到宿主实现（见 vitest.config.mts）。
 */

import { describe, expect, it } from 'vitest';
import {
  average,
  currentMode,
  deltaInfo,
  formatCompact,
  formatNumber,
  formatSignedPercent,
  labels,
  pctChange,
  previousWindow,
  seriesValues,
  topWithOther
} from '../../resources/plugins/nexus.token-usage/dist/util.mjs';

describe('token-usage plugin util', () => {
  it('formatCompact / formatNumber 返回字符串', () => {
    expect(typeof formatCompact(1234)).toBe('string');
    expect(typeof formatNumber(1234)).toBe('string');
    expect(formatCompact(1234).length).toBeGreaterThan(0);
  });

  it('labels 跟随语言（zh / en）', () => {
    document.documentElement.lang = 'zh-CN';
    expect(labels().usage).toBe('用量');
    expect(labels().scope).toBe('作用域');

    document.documentElement.lang = 'en';
    expect(labels().usage).toBe('Usage');
    expect(labels().scope).toBe('Scope');
    document.documentElement.lang = 'zh-CN';
  });

  it('currentMode 跟随 <html data-theme>', () => {
    document.documentElement.dataset.theme = 'dark';
    expect(currentMode()).toBe('dark');
    document.documentElement.dataset.theme = 'light';
    expect(currentMode()).toBe('light');
  });

  it('previousWindow 返回等长前区间，非法输入返回 null', () => {
    expect(previousWindow(1000, 4000)).toEqual({ from: -2000, to: 1000 });
    expect(previousWindow(undefined, 4000)).toBeNull();
    expect(previousWindow(4000, 4000)).toBeNull();
  });

  it('pctChange / formatSignedPercent / average', () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
    expect(pctChange(80, 100)).toBeCloseTo(-0.2);
    expect(pctChange(5, 0)).toBeNull();
    expect(average(100, 4)).toBe(25);
    expect(average(100, 0)).toBe(0);
    expect(formatSignedPercent(0.25)).toBe('+25%');
    expect(formatSignedPercent(0.034)).toBe('+3.4%');
    expect(formatSignedPercent(-0.5)).toBe('-50%');
  });

  it('deltaInfo 语义与缺省', () => {
    document.documentElement.dataset.theme = 'light';
    const up = deltaInfo(120, 100);
    expect(up?.up).toBe(true);
    const downGood = deltaInfo(80, 100, true);
    expect(downGood?.up).toBe(false);
    expect(deltaInfo(10, 0)).toBeNull();
  });

  it('topWithOther 合并超出项，seriesValues 提取字段', () => {
    const rows = [
      { label: 'a', totalTokens: 10, calls: 1 },
      { label: 'b', totalTokens: 8, calls: 2 },
      { label: 'c', totalTokens: 6, calls: 3 }
    ];
    const merged = topWithOther(rows, 2, '其他');
    expect(merged).toHaveLength(3);
    expect(merged[2]).toMatchObject({ key: '__other__', label: '其他', totalTokens: 6, calls: 3 });
    expect(topWithOther(rows, 5, '其他')).toHaveLength(3);
    expect(seriesValues([{ totalTokens: 3 }, { totalTokens: 5 }])).toEqual([3, 5]);
  });
});
