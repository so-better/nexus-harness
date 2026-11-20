<template>
  <div class="nh-reasoning" :class="{ 'nh-reasoning--open': open }">
    <NButton text block class="nh-reasoning__header" @click="open = !open">
      <span class="nh-reasoning__main">
        <AppIcon
          :name="streaming ? 'loader' : 'lightbulb'"
          :size="14"
          :class="{ 'nh-reasoning__spin': streaming }"
        />
        {{ streaming ? t('chat.thinking') : t('chat.reasoning') }}
      </span>
      <AppIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="14" />
    </NButton>
    <div v-show="open" class="nh-reasoning__body">
      <MarkdownContent :content="text" :streaming="streaming" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 推理段：每次出现独立成块，可折叠，参与消息时间线排序。
 */

import { ref, watch } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import MarkdownContent from '../render/MarkdownContent.vue';

const props = withDefaults(defineProps<{ text: string; streaming?: boolean }>(), {
  streaming: false
});

// 历史推理默认折叠；正在流式的段自动展开，避免长任务里堆满推理块
const open = ref(props.streaming);
watch(
  () => props.streaming,
  (streaming) => {
    if (streaming) open.value = true;
  }
);
</script>

<style scoped lang="less">
.nh-reasoning {
  margin-bottom: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--nh-color-text-secondary) 12%, var(--nh-border-subtle));
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 82%, transparent);
}

.nh-reasoning__header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-reasoning__header:hover {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
}

.nh-reasoning--open .nh-reasoning__header {
  border-bottom: 1px solid var(--nh-border-subtle);
}

.nh-reasoning__main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.nh-reasoning__spin {
  animation: nh-reasoning-spin 1.2s linear infinite;
}

.nh-reasoning__body {
  max-height: 240px;
  overflow-y: auto;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 55%, transparent);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.65;
}

/* MarkdownContent 默认 14px，推理区需降一级，避免与正文抢视觉权重 */
.nh-reasoning__body :deep(.nh-markdown) {
  font-size: 12px;
  line-height: 1.65;
}

.nh-reasoning__body :deep(.nh-markdown h1),
.nh-reasoning__body :deep(.nh-markdown h2),
.nh-reasoning__body :deep(.nh-markdown h3),
.nh-reasoning__body :deep(.nh-markdown h4) {
  font-size: 13px;
}

.nh-reasoning__body :deep(.nh-markdown code),
.nh-reasoning__body :deep(.nh-markdown .md-code-block pre) {
  font-size: 11px;
}

@keyframes nh-reasoning-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
