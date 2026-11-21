<template>
  <div class="nh-markdown-segments">
    <template v-for="(segment, index) in segments" :key="index">
      <MarkdownContent
        v-if="segment.type === 'md'"
        :content="segment.content"
        :streaming="streaming && index === lastMdIndex"
      />
      <ChartRenderer v-else-if="segment.type === 'echarts'" :option="segment.option" />
      <MermaidRenderer v-else-if="segment.type === 'mermaid'" :code="segment.code" />
      <iframe
        v-else
        class="nh-markdown-segments__iframe"
        sandbox="allow-scripts"
        :srcdoc="segment.code"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * AI 回复分段渲染：Markdown、ECharts、Mermaid 与 HTML iframe。
 */

import { computed } from 'vue';
import ChartRenderer from './ChartRenderer.vue';
import MarkdownContent from './MarkdownContent.vue';
import MermaidRenderer from './MermaidRenderer.vue';
import { parseSegments } from './parse-segments';

const props = defineProps<{
  content: string;
  streaming?: boolean;
}>();

const segments = computed(() => parseSegments(props.content));
const lastMdIndex = computed(() => {
  let index = -1;
  segments.value.forEach((segment, current) => {
    if (segment.type === 'md') index = current;
  });
  return index;
});
</script>

<style scoped lang="less">
.nh-markdown-segments {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.nh-markdown-segments__iframe {
  width: 100%;
  height: 360px;
  margin: 12px 0;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-color-bg-base);
}
</style>
