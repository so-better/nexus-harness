/**
 * 插件共享卡片：指标卡、上下文卡（Naive UI）。
 */

import { h } from 'nexus/vue';
import { NCard, NGrid, NGridItem, NProgress } from 'nexus/naive-ui';
import { formatNumber, palette } from './util.mjs';

/** 指标卡：label + 大号数值（可带后缀与配色） */
export const statCard = (label, value, options = {}) =>
  h(NCard, { size: 'small', class: 'nu-stat' }, () => [
    h('div', { class: 'nu-stat__label' }, label),
    h(
      'div',
      { class: 'nu-stat__value', style: options.tone ? `color:${options.tone}` : '' },
      [
        String(formatNumber(value)),
        options.suffix ? h('span', { class: 'nu-stat__suffix' }, options.suffix) : null
      ]
    )
  ]);

const contextTone = (percent) => {
  const p = palette();
  if (percent >= 90) return p.danger;
  if (percent >= 70) return p.warning;
  return p.success;
};

/** 上下文占用卡：醒目百分比 + 彩色进度条 + 已用/窗口/剩余/预留输出 + 构成估算 */
export const contextCard = (context, text) => {
  const used = context.contextTokens ?? 0;
  const windowSize = context.contextWindow ?? 0;
  const reserved = context.maxOutputTokens ?? 0;
  const remaining = Math.max(0, windowSize - used - reserved);
  const percent = windowSize > 0 ? Math.min(100, Math.round((used / windowSize) * 100)) : 0;
  const p = palette();
  const tone = contextTone(percent);
  const rows = [
    [text.contextUsed, used],
    [text.contextWindow, windowSize],
    [text.contextRemaining, remaining],
    [text.reservedOutput, reserved]
  ];
  const breakdown = context.breakdown
    ? [
        [text.breakdownSystem, context.breakdown.systemTokens ?? 0],
        [text.breakdownTools, context.breakdown.toolsTokens ?? 0],
        [text.breakdownHistory, context.breakdown.historyTokens ?? 0]
      ]
    : [];
  const blocks = [
    h('div', { class: 'nu-ctx__head' }, [
      h('div', { class: 'nu-ctx__big', style: `color:${tone}` }, [
        String(percent),
        h('span', { class: 'nu-stat__suffix' }, '%')
      ]),
      h('div', { class: 'nu-ctx__meta' }, `${formatNumber(used)} / ${formatNumber(windowSize)}`)
    ]),
    h(NProgress, {
      type: 'line',
      percentage: percent,
      height: 12,
      borderRadius: 8,
      color: tone,
      railColor: p.border,
      showIndicator: false
    }),
    h(NGrid, { cols: 4, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true }, () =>
      rows.map(([label, value]) => h(NGridItem, {}, () => statCard(label, value)))
    )
  ];
  if (breakdown.length) {
    blocks.push(
      h(
        NGrid,
        { cols: 3, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
        () => breakdown.map(([label, value]) => h(NGridItem, {}, () => statCard(label, value)))
      )
    );
  }
  return h(NCard, { size: 'small', title: text.context }, () =>
    h('div', { class: 'nu-stack' }, blocks)
  );
};
