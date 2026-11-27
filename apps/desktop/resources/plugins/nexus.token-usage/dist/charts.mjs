/**
 * ECharts 封装与通用图表 option（跟随宿主主题色）。
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'nexus/vue';
import { loadEcharts } from 'nexus/echarts';
import { formatCompact, formatNumber, formatTime } from './util.mjs';

const seriesColor = (p, i) => [p.accent, p.idle, p.success, p.warning, p.danger][i % 5];

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
    watch(() => props.option, (option) => chart?.setOption(option), { deep: true });

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

/** 时间序列折线（输入/输出） */
export const lineOption = (series, p, text) => ({
  backgroundColor: 'transparent',
  grid: baseGrid,
  tooltip: tooltip(p),
  legend: { top: 0, right: 0, textStyle: axisLabel(p), icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: series.map((point) => formatTime(point.start)),
    axisLabel: axisLabel(p),
    axisLine: { lineStyle: { color: p.border } },
    axisTick: { show: false }
  },
  yAxis: {
    type: 'value',
    name: text.total,
    nameTextStyle: axisLabel(p),
    nameGap: 12,
    axisLabel: { ...axisLabel(p), formatter: (v) => formatCompact(v) },
    splitLine: splitLine(p)
  },
  series: [
    {
      name: text.input,
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.12 },
      lineStyle: { width: 2, color: p.accent },
      itemStyle: { color: p.accent },
      data: series.map((point) => point.inputTokens)
    },
    {
      name: text.output,
      type: 'line',
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.1 },
      lineStyle: { width: 2, color: p.idle },
      itemStyle: { color: p.idle },
      data: series.map((point) => point.outputTokens)
    }
  ]
});

/** 横向条形（按 Provider / 会话排行） */
export const barOption = (rows, p, text) => {
  const top = rows.slice(0, 8).reverse();
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 24, top: 8, bottom: 4, containLabel: true },
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
      axisLabel: { ...axisLabel(p), formatter: (v) => formatCompact(v) },
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
        barWidth: 12,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: (info) => seriesColor(p, info.dataIndex)
        },
        data: top.map((row) => row.totalTokens)
      }
    ]
  };
};

/** 环形占比 */
export const donutOption = (rows, p, text) => ({
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
        radius: ['46%', '66%'],
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
        data: rows.map((row, index) => ({
          name: row.label ?? row.key,
          value: row.totalTokens,
          itemStyle: { color: seriesColor(p, index) }
        }))
      }
    ],
    legend: (rows.length > 1
      ? {
          show: true,
          bottom: 0,
          type: 'scroll',
          icon: 'circle',
          itemWidth: 8,
          itemHeight: 8,
          textStyle: { color: p.textSecondary, fontSize: 11 }
        }
      : { show: false })
  });
