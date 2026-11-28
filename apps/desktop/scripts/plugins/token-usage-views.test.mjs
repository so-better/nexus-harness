// @vitest-environment jsdom
/**
 * token-usage 插件两个视图的渲染冒烟测试：
 * 用假 ctx.usage.getStats 挂载真实 dashboard / stats 视图，验证渲染不抛错且关键结构出现。
 * `nexus/*` 由 vitest.config.mts 别名映射；echarts 使用最小桩（见 echarts-test-shim.mjs）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSessionIdRef } from '../../resources/plugins/nexus.token-usage/dist/util.mjs';
import { mountDashboard } from '../../resources/plugins/nexus.token-usage/dist/dashboard.mjs';
import { mountStatsPage } from '../../resources/plugins/nexus.token-usage/dist/stats.mjs';

const point = (start, input, output, cacheRead, calls) => ({
  key: String(start),
  start,
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: Math.round(cacheRead / 4),
  cost: 0,
  calls
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const makeStats = (query = {}) => {
  const series = [
    point(NOW - 4 * DAY, 12000, 3000, 4000, 6),
    point(NOW - 3 * DAY, 18000, 4200, 7000, 9),
    point(NOW - 2 * DAY, 9000, 2400, 3000, 4),
    point(NOW - 1 * DAY, 22000, 5100, 9000, 11),
    point(NOW, 15000, 3600, 6000, 7)
  ];
  const input = series.reduce((acc, s) => acc + s.inputTokens, 0);
  const output = series.reduce((acc, s) => acc + s.outputTokens, 0);
  return {
    totals: {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      cacheReadTokens: 29000,
      cacheWriteTokens: 7250,
      cost: 0,
      calls: 37
    },
    series,
    sessions: query.sessionId
      ? []
      : [
          {
            sessionId: 's1',
            title: '修复登录缺陷',
            lastUsedAt: NOW,
            inputTokens: input,
            outputTokens: output,
            totalTokens: input + output,
            cacheReadTokens: 29000,
            cacheWriteTokens: 7250,
            cost: 0,
            calls: 20
          },
          {
            sessionId: 's2',
            title: '重构用量统计',
            lastUsedAt: NOW - DAY,
            inputTokens: 5000,
            outputTokens: 1200,
            totalTokens: 6200,
            cacheReadTokens: 1000,
            cacheWriteTokens: 250,
            cost: 0,
            calls: 17
          }
        ],
    models: [
      {
        key: 'gpt-4o',
        label: 'gpt-4o',
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        cacheReadTokens: 29000,
        cacheWriteTokens: 7250,
        cost: 0,
        calls: 37
      }
    ],
    providers: [
      {
        key: 'openai',
        label: 'openai',
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        cacheReadTokens: 29000,
        cacheWriteTokens: 7250,
        cost: 0,
        calls: 37
      }
    ],
    ...(query.sessionId
      ? {
          context: {
            contextWindow: 200000,
            maxOutputTokens: 8000,
            contextTokens: 54000,
            breakdown: { systemTokens: 3000, toolsTokens: 6000, historyTokens: 45000 }
          }
        }
      : {})
  };
};

const makeCtx = (handlers = {}) => ({
  pluginId: 'nexus.token-usage',
  settings: {},
  logger: { debug() {}, info() {}, warn() {}, error: vi.fn() },
  events: {
    on: (name, cb) => {
      handlers[name] = cb;
      return () => {};
    }
  },
  usage: { getStats: vi.fn(async (query) => makeStats(query)) }
});

const flush = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

describe('token-usage 插件视图渲染', () => {
  beforeEach(() => {
    document.documentElement.lang = 'zh-CN';
    document.documentElement.dataset.theme = 'light';
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia =
      window.matchMedia ||
      (() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {}
      }));
  });

  it('看板视图渲染英雄区、指标卡与图表容器', async () => {
    activeSessionIdRef.value = 's1';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ctx = makeCtx();
    const dispose = mountDashboard(host, ctx);
    await flush();
    expect(ctx.logger.error).not.toHaveBeenCalled();
    expect(host.querySelector('.nu-hero')).toBeTruthy();
    expect(host.querySelectorAll('.nu-stat').length).toBeGreaterThan(0);
    expect(host.querySelector('.nu-spark')).toBeTruthy();
    expect(host.querySelector('.nu-ctx__head')).toBeTruthy();
    dispose();
    host.remove();
    activeSessionIdRef.value = null;
  });

  it('统计页渲染标题、英雄区与排行', async () => {
    activeSessionIdRef.value = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ctx = makeCtx();
    const dispose = mountStatsPage(host, ctx);
    await flush();
    expect(ctx.logger.error).not.toHaveBeenCalled();
    expect(host.querySelector('.nu-page')).toBeTruthy();
    expect(host.querySelector('.nu-title')).toBeTruthy();
    expect(host.querySelector('.nu-hero')).toBeTruthy();
    expect(host.querySelector('.nu-rank')).toBeTruthy();
    dispose();
    host.remove();
  });

  it('删除当前筛选的会话后回落到全部会话', async () => {
    activeSessionIdRef.value = null;
    const handlers = {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ctx = makeCtx(handlers);
    const dispose = mountStatsPage(host, ctx);
    await flush();

    // 点击会话排行第一行进行筛选
    const row = host.querySelector('.nu-rank__row--clickable');
    expect(row).toBeTruthy();
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(ctx.usage.getStats).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: 's1' })
    );

    // 模拟删除该会话：应清空筛选并重新按全部会话查询
    handlers['session.removed']?.({}, { type: 'session.removed', sessionId: 's1', ts: Date.now() });
    await flush();
    expect(ctx.usage.getStats).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ sessionId: 's1' })
    );

    dispose();
    host.remove();
  });
});
