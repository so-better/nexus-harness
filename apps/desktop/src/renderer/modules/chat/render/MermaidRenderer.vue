<template>
  <div class="nh-mermaid">
    <div v-show="Boolean(svg)" ref="diagram" class="nh-mermaid__diagram" />
    <pre v-if="error" class="nh-mermaid__error">{{ error }}</pre>
    <pre v-else-if="!svg" class="nh-mermaid__source">{{ code }}</pre>
  </div>
</template>

<script setup lang="ts">
/**
 * Mermaid 渲染器：严格安全模式，跟随主题重绘。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { effectiveTheme } from '@/app/theme';

const props = defineProps<{ code: string }>();
const diagram = ref<HTMLElement>();
const svg = ref('');
const error = ref('');
let sequence = 0;
let renderToken = 0;

const render = async (): Promise<void> => {
  const token = ++renderToken;
  svg.value = '';
  error.value = '';
  if (!props.code.trim()) return;
  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      theme: effectiveTheme.value === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      suppressErrorRendering: true
    });
    const result = await mermaid.render(`nh-mermaid-${Date.now()}-${sequence++}`, props.code);
    if (token === renderToken) svg.value = result.svg;
  } catch (reason) {
    if (token === renderToken) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  }
};

watch(
  svg,
  (value) => {
    if (diagram.value) diagram.value.innerHTML = value;
  },
  { flush: 'post' }
);

onMounted(render);
watch(() => props.code, render);
watch(effectiveTheme, render);
onBeforeUnmount(() => {
  renderToken += 1;
  svg.value = '';
});
</script>

<style scoped lang="less">
.nh-mermaid {
  margin: 12px 0;
  padding: 12px;
  overflow-x: auto;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}

.nh-mermaid__diagram :deep(svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.nh-mermaid__error,
.nh-mermaid__source {
  margin: 0;
  color: var(--nh-color-text-secondary);
  white-space: pre-wrap;
}

.nh-mermaid__error {
  color: var(--nh-color-danger);
}
</style>
