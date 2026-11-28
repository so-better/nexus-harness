/**
 * 插件共享卡片与轻量图形：迷你趋势线、环形占比、指标卡、横向排行与上下文卡。
 * 纯 SVG 图形（Sparkline / Ring）避免为小元素额外创建 ECharts 实例。
 */

import { defineComponent, h } from 'nexus/vue';
import { NCard, NGrid, NGridItem, NProgress } from 'nexus/naive-ui';
import { formatNumber, palette } from './util.mjs';

/**
 * 迷你趋势线：按比例折线 + 渐变面积，宽度自适应容器。
 * values 少于 2 个点时渲染占位块。
 */
export const Sparkline = defineComponent({
  props: {
    values: { type: Array, default: () => [] },
    color: { type: String, default: 'currentColor' },
    height: { type: Number, default: 32 }
  },
  setup(props) {
    const width = 120;
    return () => {
      const values = Array.isArray(props.values) ? props.values : [];
      if (values.length < 2) return h('div', { class: 'nu-spark nu-spark--empty' });
      const max = Math.max(...values);
      const min = Math.min(...values);
      const span = max - min;
      const stepX = width / (values.length - 1);
      const points = values.map((value, index) => {
        // 数值全相等时 span 为 0，按 0.5 归一让折线落在中间，而不是贴底
        const ratio = span > 0 ? (value - min) / span : 0.5;
        const y = props.height - 2 - ratio * (props.height - 6);
        return [index * stepX, y];
      });
      const line = points
        .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');
      const area = `${line} L${width} ${props.height} L0 ${props.height} Z`;
      return h(
        'svg',
        {
          class: 'nu-spark',
          viewBox: `0 0 ${width} ${props.height}`,
          preserveAspectRatio: 'none',
          'aria-hidden': 'true'
        },
        [
          h('path', { d: area, fill: props.color, 'fill-opacity': 0.14, stroke: 'none' }),
          h('path', {
            d: line,
            fill: 'none',
            stroke: props.color,
            'stroke-width': 1.5,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          })
        ]
      );
    };
  }
});

/** 环形进度：用于缓存命中率等单一比率展示 */
export const Ring = defineComponent({
  props: {
    percent: { type: Number, default: 0 },
    tone: { type: String, default: 'currentColor' },
    size: { type: Number, default: 104 },
    thickness: { type: Number, default: 10 },
    label: { type: String, default: '' }
  },
  setup(props) {
    return () => {
      const radius = (props.size - props.thickness) / 2;
      const circumference = 2 * Math.PI * radius;
      const ratio = Math.max(0, Math.min(1, props.percent));
      const center = props.size / 2;
      return h(
        'svg',
        {
          class: 'nu-ring',
          width: props.size,
          height: props.size,
          viewBox: `0 0 ${props.size} ${props.size}`,
          role: 'img',
          'aria-label': props.label
        },
        [
          h('circle', {
            cx: center,
            cy: center,
            r: radius,
            fill: 'none',
            stroke: 'var(--nh-border-subtle)',
            'stroke-width': props.thickness
          }),
          h('circle', {
            cx: center,
            cy: center,
            r: radius,
            fill: 'none',
            stroke: props.tone,
            'stroke-width': props.thickness,
            'stroke-linecap': 'round',
            'stroke-dasharray': `${circumference * ratio} ${circumference}`,
            transform: `rotate(-90 ${center} ${center})`
          }),
          h(
            'text',
            {
              x: '50%',
              y: '50%',
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              fill: 'var(--nh-color-text-primary)',
              'font-size': props.size * 0.23,
              'font-weight': 700
            },
            `${Math.round(ratio * 100)}%`
          )
        ]
      );
    };
  }
});

/** 环比徽标文案（含方向箭头），无数据时返回 null */
const deltaBadge = (delta) =>
  delta
    ? h(
        'span',
        { class: 'nu-delta', style: `color:${delta.tone}` },
        `${delta.up ? '↑' : '↓'} ${delta.text}`
      )
    : null;

/**
 * 指标卡：标题 + 大号数值（可带后缀与配色），可带迷你趋势线与环比。
 */
export const statCard = (label, value, options = {}) => {
  const { suffix, tone, spark, delta, caption } = options;
  const hasSpark = Array.isArray(spark) && spark.length > 1;
  const footer = delta || caption;
  return h(NCard, { size: 'small', class: 'nu-stat' }, () => [
    h('div', { class: 'nu-stat__top' }, [
      h('span', { class: 'nu-stat__label' }, label),
      hasSpark ? h(Sparkline, { values: spark, color: tone || palette().accent }) : null
    ]),
    h('div', { class: 'nu-stat__value', style: tone ? `color:${tone}` : '' }, [
      String(formatNumber(value)),
      suffix ? h('span', { class: 'nu-stat__suffix' }, suffix) : null
    ]),
    footer
      ? h('div', { class: 'nu-stat__foot' }, [
          deltaBadge(delta),
          caption ? h('span', { class: 'nu-stat__caption' }, caption) : null
        ])
      : null
  ]);
};

/** 顶部英雄区：大号总量 + 环比，右侧附若干次级指标 */
export const heroBand = ({ eyebrow, value, sub, delta, stats = [] }) =>
  h('div', { class: 'nu-hero' }, [
    h('div', { class: 'nu-hero__copy' }, [
      h('span', { class: 'nu-hero__eyebrow' }, eyebrow),
      h('div', { class: 'nu-hero__main' }, [
        h('strong', { class: 'nu-hero__value' }, formatNumber(value)),
        deltaBadge(delta)
      ]),
      h('span', { class: 'nu-hero__sub' }, sub)
    ]),
    stats.length
      ? h(
          'div',
          { class: 'nu-hero__side' },
          stats.map((stat) =>
            h('div', { class: 'nu-hero__stat' }, [
              h('strong', {}, stat.value),
              h('span', {}, stat.label),
              deltaBadge(stat.delta)
            ])
          )
        )
      : null
  ]);

/** 缓存行：色点 + 名称 + 数值 + 占输入比例 */
const cacheRow = (label, value, tone, input) =>
  h('div', { class: 'nu-cache__row' }, [
    h('span', { class: 'nu-cache__dot', style: `background:${tone}` }),
    h('span', { class: 'nu-cache__k' }, label),
    h('span', { class: 'nu-cache__v' }, formatNumber(value)),
    h('span', { class: 'nu-cache__pct' }, input > 0 ? `${Math.round((value / input) * 100)}%` : '')
  ]);

/** 缓存卡：命中率环形 + 读/写/未缓存输入构成 */
export const cacheCard = (totals, text) => {
  const p = palette();
  const input = totals.inputTokens ?? 0;
  const read = totals.cacheReadTokens ?? 0;
  const write = totals.cacheWriteTokens ?? 0;
  const fresh = Math.max(0, input - read);
  const rate = input > 0 ? read / input : 0;
  return h(NCard, { size: 'small', title: text.cacheTitle }, () =>
    h('div', { class: 'nu-cache' }, [
      h('div', { class: 'nu-cache__ring' }, [
        h(Ring, { percent: rate, tone: p.success, label: text.cacheHit }),
        h('span', { class: 'nu-cache__ringlabel' }, text.cacheHit)
      ]),
      h('div', { class: 'nu-cache__rows' }, [
        cacheRow(text.cacheRead, read, p.success, input),
        cacheRow(text.cacheWrite, write, p.warning, input),
        cacheRow(text.freshInput, fresh, p.idle, input)
      ]),
      h('p', { class: 'nu-cache__note' }, text.cacheNote)
    ])
  );
};

/**
 * 横向排行：序号 + 名称 + 占比条 + 数值/占比。
 * onSelect 存在时整行可点击（键盘 Enter / Space 亦可触发）。
 */
export const rankList = (rows, options = {}) => {
  const { total, tone, valueKey = 'totalTokens', labelKey = 'label', onSelect } = options;
  if (!rows || !rows.length) return h('div', { class: 'nu-rank nu-rank--empty' }, '—');
  const p = palette();
  const color = tone || p.accent;
  const max = Math.max(...rows.map((row) => row[valueKey] ?? 0), 1);
  const sum = total ?? rows.reduce((acc, row) => acc + (row[valueKey] ?? 0), 0);
  const interactive = typeof onSelect === 'function';
  return h(
    'div',
    { class: 'nu-rank' },
    rows.map((row, index) =>
      h(
        'div',
        {
          class: ['nu-rank__row', interactive ? 'nu-rank__row--clickable' : ''],
          role: interactive ? 'button' : undefined,
          tabindex: interactive ? 0 : undefined,
          onClick: interactive ? () => onSelect(row) : undefined,
          onKeydown: interactive
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row);
                }
              }
            : undefined
        },
        [
          h('span', { class: 'nu-rank__idx' }, String(index + 1)),
          h('span', { class: 'nu-rank__body' }, [
            h('span', { class: 'nu-rank__head' }, [
              h(
                'span',
                { class: 'nu-rank__label', title: row[labelKey] },
                row[labelKey] ?? row.key ?? '—'
              ),
              h('span', { class: 'nu-rank__value' }, formatNumber(row[valueKey]))
            ]),
            h('span', { class: 'nu-rank__bar' }, [
              h('span', {
                class: 'nu-rank__fill',
                style: `width:${(((row[valueKey] ?? 0) / max) * 100).toFixed(1)}%;background:${color}`
              })
            ])
          ]),
          h(
            'span',
            { class: 'nu-rank__share' },
            sum > 0 ? `${Math.round(((row[valueKey] ?? 0) / sum) * 100)}%` : ''
          )
        ]
      )
    )
  );
};

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
    h(
      NGrid,
      { cols: 4, 'x-gap': 12, 'y-gap': 12, responsive: 'screen', itemResponsive: true },
      () => rows.map(([label, value]) => h(NGridItem, {}, () => statCard(label, value)))
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
