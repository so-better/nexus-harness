/**
 * ECharts 封装、配色与通用图表 option（跟随宿主主题色）。
 * 配色一律从宿主调色板派生，保证深浅主题下协调一致。
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'nexus/vue';
import { loadEcharts } from 'nexus/echarts';
import { DAY_MS, formatCompact, formatNumber, formatTime, topWithOther } from './util.mjs';

// ---- 颜色工具：分类配色以主题强调色为锚点，在 HSL 色环上等距取色 ----

/** 解析 #rgb / #rrggbb 为 [r,g,b]（0–255） */
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

/** [r,g,b] → [h(0–360), s(0–1), l(0–1)] */
const rgbToHsl = ([r, g, b]) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const light = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (delta !== 0) {
    sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }
  return [hue * 360, sat, light];
};

/** [h(0–360), s(0–1), l(0–1)] → #rrggbb */
const hslToHex = (h, s, l) => {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = l - chroma / 2;
  const sector = ((h % 360) + 360) % 360;
  let rgb;
  if (sector < 60) rgb = [chroma, x, 0];
  else if (sector < 120) rgb = [x, chroma, 0];
  else if (sector < 180) rgb = [0, chroma, x];
  else if (sector < 240) rgb = [0, x, chroma];
  else if (sector < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
};

/**
 * 分类配色环：在主题强调色与 idle 色的两个色相之间交替，并按次序逐级提高明度，
 * 得到一组同色系、可区分、有层次的颜色，避免彩虹式堆砌与混色发浊。
 */
const categoryRamp = (p) => {
  const [accentHue, accentSat, accentLight] = rgbToHsl(hexToRgb(p.accent));
  const [idleHue] = rgbToHsl(hexToRgb(p.idle));
  const isDark = accentLight > 0.6;
  const sat = Math.min(0.6, Math.max(0.45, accentSat));
  const baseLight = isDark ? 0.62 : 0.48;
  const maxLight = isDark ? 0.8 : 0.7;
  return Array.from({ length: 8 }, (_, index) => {
    const hue = index % 2 === 0 ? accentHue : idleHue;
    const light = Math.min(maxLight, baseLight + Math.floor(index / 2) * 0.06);
    return hslToHex(hue, sat, light);
  });
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

// ---- 通用样式片段 ----

const axisLabel = (p) => ({ color: p.textSecondary, fontSize: 12 });
const splitLine = (p) => ({ lineStyle: { color: p.border, type: 'solid' } });
const axisLine = () => ({ show: false });
const axisTick = () => ({ show: false });
const tooltip = (p) => ({
  trigger: 'axis',
  renderMode: 'richText',
  backgroundColor: p.bgPopover,
  borderColor: p.border,
  padding: [8, 12],
  textStyle: { color: p.textPrimary, fontSize: 12 },
  axisPointer: { type: 'line', lineStyle: { color: p.border } }
});

/**
 * 时间序列趋势图：左轴 token 构成堆叠面积（缓存读 / 未缓存输入 / 输出），
 * 右轴调用次数折线，同一张图同时展示，无需在指标间切换。
 */
export const trendOption = (series, p, text) => {
  const points = series ?? [];
  const span = points.length > 1 ? points[points.length - 1].start - points[0].start : 0;
  const withHour = span > 0 && span < 2 * DAY_MS;
  const fresh = points.map((point) =>
    Math.max(0, (point.inputTokens ?? 0) - (point.cacheReadTokens ?? 0))
  );
  const cacheRead = points.map((point) => point.cacheReadTokens ?? 0);
  const output = points.map((point) => point.outputTokens ?? 0);
  const calls = points.map((point) => point.calls ?? 0);
  const hasCache = cacheRead.some((value) => value > 0);
  const tokenFormatter = (value) => `${formatNumber(value)} ${text.unitTokens}`;
  const bands = [
    ...(hasCache ? [{ name: text.cacheRead, data: cacheRead, color: p.success }] : []),
    { name: text.freshInput, data: fresh, color: p.accent },
    { name: text.output, data: output, color: p.idle }
  ].map((band) => ({
    name: band.name,
    type: 'line',
    stack: 'total',
    smooth: true,
    showSymbol: false,
    yAxisIndex: 0,
    emphasis: { focus: 'series' },
    lineStyle: { width: 1, color: band.color },
    itemStyle: { color: band.color },
    areaStyle: { color: band.color, opacity: 0.72 },
    valueFormatter: tokenFormatter,
    data: band.data
  }));
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 12, top: 48, bottom: 8, containLabel: true },
    tooltip: tooltip(p),
    legend: {
      top: 0,
      left: 'center',
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 18,
      textStyle: { color: p.textSecondary, fontSize: 12 }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => formatTime(point.start, withHour)),
      axisLabel: axisLabel(p),
      axisLine: axisLine(),
      axisTick: axisTick()
    },
    yAxis: [
      {
        type: 'value',
        name: text.unitTokens,
        nameTextStyle: axisLabel(p),
        nameGap: 16,
        axisLabel: { ...axisLabel(p), formatter: (value) => formatCompact(value) },
        axisLine: axisLine(),
        axisTick: axisTick(),
        splitLine: splitLine(p)
      },
      {
        type: 'value',
        name: text.unitCalls,
        nameTextStyle: axisLabel(p),
        nameGap: 16,
        position: 'right',
        minInterval: 1,
        axisLabel: { ...axisLabel(p), formatter: (value) => formatCompact(value) },
        axisLine: axisLine(),
        axisTick: axisTick(),
        splitLine: { show: false }
      }
    ],
    series: [
      ...bands,
      {
        name: text.calls,
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: p.warning },
        itemStyle: { color: p.warning },
        emphasis: { focus: 'series' },
        valueFormatter: (value) => `${formatNumber(value)} ${text.unitCalls}`,
        data: calls
      }
    ]
  };
};

/** 横向条形（按 Provider 排行）：同色系渐变 + 圆角，突出排名而非堆砌颜色 */
export const barOption = (rows, p, text, limit = 8) => {
  const top = rows.slice(0, limit).reverse();
  const color = {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 1,
    y2: 0,
    colorStops: [
      { offset: 0, color: p.accent },
      { offset: 1, color: p.accentHover }
    ]
  };
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      backgroundColor: p.bgPopover,
      borderColor: p.border,
      padding: [8, 12],
      textStyle: { color: p.textPrimary, fontSize: 12 },
      formatter: (info) => `${info.name}\n${formatNumber(info.value)} ${text.unitTokens}`
    },
    xAxis: {
      type: 'value',
      name: text.unitTokens,
      nameTextStyle: axisLabel(p),
      nameGap: 12,
      axisLabel: { ...axisLabel(p), formatter: (value) => formatCompact(value) },
      axisLine: axisLine(),
      axisTick: axisTick(),
      splitLine: splitLine(p)
    },
    yAxis: {
      type: 'category',
      data: top.map((row) => row.label ?? row.key),
      axisLabel: axisLabel(p),
      axisLine: axisLine(),
      axisTick: axisTick()
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        itemStyle: { color, borderRadius: [4, 7, 7, 4] },
        label: {
          show: true,
          position: 'right',
          formatter: (info) => formatCompact(info.value),
          color: p.textSecondary,
          fontSize: 12
        },
        data: top.map((row) => row.totalTokens)
      }
    ]
  };
};

/** 环形占比：分类配色 + 圆角分段 + 中心总量；超出 limit 的项合并为「其他」 */
export const donutOption = (rows, p, text, limit = 6) => {
  const data = topWithOther(rows ?? [], limit, text.other);
  const total = data.reduce((acc, row) => acc + (row.totalTokens ?? 0), 0);
  const ramp = categoryRamp(p);
  return {
    backgroundColor: 'transparent',
    color: ramp,
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      backgroundColor: p.bgPopover,
      borderColor: p.border,
      padding: [8, 12],
      textStyle: { color: p.textPrimary, fontSize: 12 },
      formatter: (info) =>
        `${info.name}\n${formatNumber(info.value)} ${text.unitTokens} (${info.percent}%)`
    },
    title: {
      text: formatCompact(total),
      subtext: text.unitTokens,
      left: 'center',
      top: '38%',
      textStyle: { color: p.textPrimary, fontSize: 20, fontWeight: 700 },
      subtextStyle: { color: p.textSecondary, fontSize: 12 }
    },
    series: [
      {
        type: 'pie',
        radius: ['56%', '74%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: p.bgBase, borderWidth: 3, borderRadius: 6 },
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: p.textSecondary,
          fontSize: 12,
          lineHeight: 16
        },
        labelLine: { length: 10, length2: 10, lineStyle: { color: p.border } },
        labelLayout: { hideOverlap: true },
        emphasis: { scale: true, scaleSize: 4 },
        data: data.map((row, index) => ({
          name: row.label ?? row.key,
          value: row.totalTokens,
          itemStyle: { color: ramp[index % ramp.length] }
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
            itemGap: 14,
            textStyle: { color: p.textSecondary, fontSize: 12 }
          }
        : { show: false }
  };
};
