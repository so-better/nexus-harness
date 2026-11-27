/**
 * Token 用量插件入口：
 * - 会话头 / 消息尾部入口（chips，Naive UI 按钮）
 * - 用量看板弹窗（usage.dashboard）
 * - 用量统计整页（usage.stats，左侧导航栏入口）
 */

import { mountUsage } from './chips.mjs';
import { mountDashboard } from './dashboard.mjs';
import { mountStatsPage } from './stats.mjs';

export function activate(ctx) {
  const inlineDispose = ctx.slots.register('usage.inline', (element, context) =>
    mountUsage(element, context, false, ctx)
  );
  const sessionDispose = ctx.slots.register('usage.session', (element, context) =>
    mountUsage(element, context, true, ctx)
  );
  const viewDispose = ctx.views.register('usage.dashboard', (element) => mountDashboard(element, ctx));
  const statsDispose = ctx.views.register('usage.stats', (element) => mountStatsPage(element, ctx));
  return () => {
    inlineDispose();
    sessionDispose();
    viewDispose();
    statsDispose();
  };
}
