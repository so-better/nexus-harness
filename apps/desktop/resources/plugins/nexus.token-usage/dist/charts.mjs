/**
 * ECharts 封装与通用图表 option（跟随宿主主题色）。
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'nexus/vue';
import { loadEcharts } from 'nexus/echarts';
import { DAY_MS, formatCompact, formatNumber, formatTime, topWithOther } from './util.mjs';

/** 解析 #rgb / #rrggbb 为 [r,g,b] */
const hexToRgb = (hex) => {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** 线性混合两个十六进制颜色，t 取 0–1 */
const mixHex = (a, b, t) => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const toHex = (channel) => Math.round(channel).toString(16).padStart(2, '0');
  return `#${[0, 1, 2].map((i) => toHex(ca[i] + (cb[i] - ca[i]) * t)).join('')}`;
};

/**
 * 图表配色环：以调色板五个语义色为基准，相邻色之间插入混合色，
 * 让切片较多时仍有足够区分度，且不引入调色板之外的硬编码颜色。
 */
const colorRamp = (p) => {
  const base = [p.accent, p.idle, p.success, p.warning, p.danger];
  const ramp = [];
  for (let i = 0; i < base.length; i += 1) {
    ramp.push(base[i]);
    ramp.push(mixHex(base[i], base[(i + 1) % base.length], 0.5));
  }
  return ramp;
};

const seriesColor = (p, i) => {
  const ramp = colorRamp(p);
  return ramp[i % ramp.length];
};

/**
 * ECharts 容器组件：懒加载 echarts，跟随主题与尺寸，销毁时释放。
 */
export const Chart = defineComponent({
  props: {
    option: { type: Object, required: true },
    height: { type: String, default: '300px' },
    theme: { type: String, default: 'light' },
    label: { type: String, default: '' }
  },
  setup(props) {
    const root = ref();
    let chart;
    let observer;
    let token = 0;

    const build = async () => {
      const mine = ++token;
      observer?.disconnect();
      observer = undefined;
      chart?.dispose();
      chart = undefined;
      if (!root.value) return;
      root.value.setAttribute('role', 'img');
      if (props.label) root.value.setAttribute('aria-label', props.label);
      const echarts = await loadEcharts();
      if (mine !== token || !root.value) return;
      chart = echarts.init(root.value, props.theme === 'dark' ? 'dark' : undefined, {
        renderer: 'canvas'
      });
      chart.setOption(props.option, true);
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(root.value);
    };

    onMounted(build);
    onBeforeUnmount(() => {
      token += 1;
      observer?.disconnect();
      chart?.dispose();
      chart = undefined;
    });
    watch(() => props.theme, build);
    // 更新用合并（notMerge=false），避免切换范围时清空重画导致闪烁
    watch(
      () => props.option,
      (option) => chart?.setOption(option),
      { deep: true }
    );

    return () =>
      h('div', {
        ref: root,
        style: { width: '100%', height: props.height, minHeight: props.height }
      });
  }
});

const baseGrid = { left: 8, right: 12, top: 36, bottom: 4, containLabel: true };
const axisLabel = (p) => ({ color: p.textSecondary, fontSize: 11 });
const splitLine = (p) => ({ lineStyle: { color: p.border, type: 'dashed' } });
const tooltip = (p) => ({
  trigger: 'axis',
  renderMode: 'richText',
  backgroundColor: p.bgPopover,
  borderColor: p.border,
  textStyle: { color: p.textPrimary, fontSize: 12 }
});

/** 堆叠面积子系列：用于输入构成（未缓存输入 / 缓存读 / 输出） */
const stackedArea = (name, data, color) => ({
  name,
  type: 'line',
  stack: 'total',
  smooth: true,
  showSymbol: false,
  emphasis: { focus: 'series' },
  lineStyle: { width: 1.5, color },
  itemStyle: { color },
  areaStyle: { color, opacity: 0.55 },
  data
});

/**
 * 时间序列趋势图。
 * metric='tokens' 展示输入构成堆叠面积（未缓存输入 / 缓存读 / 输出）；
 * metric='calls' 展示每次调用数量的柱状。
 */
export const trendOption = (series, p, text, metric = 'tokens') => {
  const points = series ?? [];
  const span = points.length > 1 ? points[points.length - 1].start - points[0].start : 0;
  const withHour = span > 0 && span < 2 * DAY_MS;
  const base = {
    backgroundColor: 'transparent',
    grid: baseGrid,
    tooltip: tooltip(p),
    xAxis: {
      type: 'category',
      boundaryGap: metric === 'calls',
      data: points.map((point) => formatTime(point.start, withHour)),
      axisLabel: axisLabel(p),
      axisLine: { lineStyle: { color: p.border } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      name: metric === 'calls' ? text.calls : text.total,
      nameTextStyle: axisLabel(p),
      nameGap: 12,
      axisLabel: { ...axisLabel(p), formatter: (value) => formatCompact(value) },
      splitLine: splitLine(p)
    }
  };
  if (metric === 'calls') {
    return {
      ...base,
      series: [
        {
          name: text.calls,
          type: 'bar',
          barMaxWidth: 22,
          itemStyle: { color: p.accent, borderRadius: [4, 4, 0, 0] },
          data: points.map((point) => point.calls)
        }
      ]
    };
  }
  const fresh = points.map((point) =>
    Math.max(0, (point.inputTokens ?? 0) - (point.cacheReadTokens ?? 0))
  );
  const cacheRead = points.map((point) => point.cacheReadTokens ?? 0);
  const output = points.map((point) => point.outputTokens ?? 0);
  const hasCache = cacheRead.some((value) => value > 0);
  return {
    ...base,
    legend: {
      top: 0,
      right: 0,
      textStyle: axisLabel(p),
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10
    },
    series: [
      ...(hasCache ? [stackedArea(text.cacheRead, cacheRead, p.success)] : []),
      stackedArea(text.freshInput, fresh, p.accent),
      stackedArea(text.output, output, p.idle)
    ]
  };
};

/** 横向条形（按 Provider 排行） */
export const barOption = (rows, p, text, limit = 8) => {
  const top = rows.slice(0, limit).reverse();
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 56, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      renderMode: 'richText',
      backgroundColor: p.bgPopover,
      borderColor: p.border,
      textStyle: { color: p.textPrimary, fontSize: 12 },
      formatter: (items) => `${items[0].name}\n${formatNumber(items[0].value)} tokens`
    },
    xAxis: {
      type: 'value',
      axisLabel: { ...axisLabel(p), formatter: (value) => formatCompact(value) },
      splitLine: splitLine(p)
    },
    yAxis: {
      type: 'category',
      data: top.map((row) => row.label ?? row.key),
      axisLabel: axisLabel(p),
      axisLine: { lineStyle: { color: p.border } },
      axisTick: { show: false }
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: (info) => seriesColor(p, info.dataIndex)
        },
        label: {
          show: true,
          position: 'right',
          formatter: (info) => formatCompact(info.value),
          color: p.textSecondary,
          fontSize: 11
        },
        data: top.map((row) => row.totalTokens)
      }
    ]
  };
};

/** 环形占比；超出 limit 的项合并为「其他」 */
export const donutOption = (rows, p, text, limit = 6) => {
  const data = topWithOther(rows ?? [], limit, text.other);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      backgroundColor: p.bgPopover,
      borderColor: p.border,
      textStyle: { color: p.textPrimary, fontSize: 12 },
      formatter: (info) => `${info.name}\n${formatNumber(info.value)} (${info.percent}%)`
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: p.bgBase, borderWidth: 2 },
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: p.textSecondary,
          fontSize: 11,
          lineHeight: 15
        },
        labelLine: { show: true, length: 8, length2: 8, lineStyle: { color: p.border } },
        labelLayout: { hideOverlap: true },
        data: data.map((row, index) => ({
          name: row.label ?? row.key,
          value: row.totalTokens,
          itemStyle: { color: seriesColor(p, index) }
        }))
      }
    ],
    legend:
      data.length > 1
        ? {
            show: true,
            bottom: 0,
            type: 'scroll',
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            textStyle: { color: p.textSecondary, fontSize: 11 }
          }
        : { show: false }
  };
};
