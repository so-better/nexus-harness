// @vitest-environment jsdom
/**
 * token-usage 插件纯逻辑测试：格式化、文案与主题模式。
 * 通过 vitest 别名把 `nexus/*` 映射到宿主实现（见 vitest.config.mts）。
 */

import { describe, expect, it } from 'vitest';
import {
  currentMode,
  formatCompact,
  formatNumber,
  labels
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
});
