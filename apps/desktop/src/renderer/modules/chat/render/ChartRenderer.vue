<template>
  <div ref="root" class="nh-echart" />
</template>

<script setup lang="ts">
/**
 * ECharts 渲染器：懒加载，tooltip 使用 richText 避免 HTML 注入。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ECharts, EChartsOption } from 'echarts';
import { effectiveTheme } from '@/app/theme';

const props = defineProps<{ option: Record<string, unknown> }>();
const root = ref<HTMLElement>();
let chart: ECharts | undefined;
let resizeObserver: ResizeObserver | undefined;
let chartToken = 0;

const sanitizeOption = (option: Record<string, unknown>): EChartsOption => {
  const base = { ...option };
  const tooltip = base['tooltip'];
  if (tooltip === undefined || tooltip === null) return base as EChartsOption;
  base['tooltip'] = Array.isArray(tooltip)
    ? tooltip.map((item) => ({ ...(item as object), renderMode: 'richText' }))
    : { ...(tooltip as object), renderMode: 'richText' };
  return base as EChartsOption;
};

const createChart = async (): Promise<void> => {
  if (!root.value) return;
  const token = ++chartToken;
  const { init } = await import('echarts');
  if (token !== chartToken || !root.value) return;
  chart?.dispose();
  chart = init(root.value, effectiveTheme.value === 'dark' ? 'dark' : undefined);
  chart.setOption(sanitizeOption(props.option), true);
};

onMounted(async () => {
  await createChart().catch(() => undefined);
  if (root.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(root.value);
  }
});

watch(
  () => props.option,
  (option) => chart?.setOption(sanitizeOption(option), true),
  { deep: true }
);

watch(effectiveTheme, () => {
  createChart().catch(() => undefined);
});

onBeforeUnmount(() => {
  chartToken += 1;
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = undefined;
});
</script>

<style scoped lang="less">
.nh-echart {
  width: 100%;
  height: 320px;
  margin: 12px 0;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}
</style>
