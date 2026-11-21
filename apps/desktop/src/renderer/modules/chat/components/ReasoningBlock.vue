<template>
  <div class="nh-reasoning">
    <NButton text block class="nh-reasoning__header" @click="open = !open">
      <span class="nh-reasoning__main">
        <AppIcon
          :name="streaming ? 'loader' : 'lightbulb'"
          :size="14"
          :class="{ 'nh-reasoning__spin': streaming }"
        />
        <span class="nh-reasoning__label">
          {{ streaming ? t('chat.thinking') : t('chat.reasoning') }}
        </span>
      </span>
      <AppIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="14" />
    </NButton>
    <div v-show="open" class="nh-reasoning__body">
      <MarkdownSegments :content="text" :streaming="streaming" />
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
import MarkdownSegments from '../render/MarkdownSegments.vue';

const props = withDefaults(defineProps<{ text: string; streaming?: boolean }>(), {
  streaming: false
});

// 每个推理块独立维护展开状态：流式时自动展开，结束后自动折叠
const open = ref(props.streaming);
watch(
  () => props.streaming,
  (streaming) => {
    open.value = streaming;
  }
);
</script>

<style scoped lang="less">
.nh-reasoning {
  min-width: 0;
}

.nh-reasoning__header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
  color: var(--nh-color-text-disabled);
  font-size: 11px;
  transition: color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-reasoning__header:hover {
  color: var(--nh-color-text-secondary);
}

.nh-reasoning__header :deep(.n-button__content) {
  justify-content: flex-start;
  gap: 8px;
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
  padding: 10px 0 0 20px;
  color: var(--nh-color-text-disabled);
  font-size: 11px;
  line-height: 1.6;
}

// MarkdownContent 默认 14px，推理区需降一级，避免与正文抢视觉权重
.nh-reasoning__body :deep(.nh-markdown) {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
  line-height: 1.6;
}

// 去掉最后一段自带的下外边距，避免底部比顶部空
.nh-reasoning__body :deep(.nh-markdown > :last-child) {
  margin-bottom: 0;
}

.nh-reasoning__body :deep(.nh-markdown h1),
.nh-reasoning__body :deep(.nh-markdown h2),
.nh-reasoning__body :deep(.nh-markdown h3),
.nh-reasoning__body :deep(.nh-markdown h4) {
  font-size: 12px;
}

.nh-reasoning__body :deep(.nh-markdown code),
.nh-reasoning__body :deep(.nh-markdown .md-code-block pre) {
  font-size: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .nh-reasoning__spin {
    animation: none;
  }
}

@keyframes nh-reasoning-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
