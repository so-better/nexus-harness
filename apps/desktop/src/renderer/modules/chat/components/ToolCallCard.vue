<template>
  <details class="nh-tool" :class="`nh-tool--${tool.status}`">
    <summary class="nh-tool__summary">
      <span class="nh-tool__name">{{ tool.name }}</span>
      <span class="nh-tool__status">{{ statusLabel }}</span>
    </summary>
    <div class="nh-tool__body">
      <p class="nh-tool__label">{{ t('tool.input') }}</p>
      <pre class="nh-tool__pre">{{ inputText }}</pre>
      <template v-if="tool.output">
        <p class="nh-tool__label">{{ t('tool.output') }}</p>
        <pre class="nh-tool__pre">{{ tool.output }}</pre>
      </template>
      <p v-if="tool.error" class="nh-tool__error">
        {{ tool.error.code }}: {{ tool.error.message }}
      </p>
      <p v-if="tool.artifactId" class="nh-tool__meta">
        {{ t('tool.artifactId') }}: {{ tool.artifactId }}
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
/**
 * 工具调用卡片：折叠展示参数、输出、错误与产物引用。
 */

import { computed } from 'vue';
import { t } from '@/app/i18n';
import type { ChatToolCall } from '../types';

const props = defineProps<{ tool: ChatToolCall }>();

const inputText = computed(() => {
  try {
    return JSON.stringify(props.tool.input, null, 2);
  } catch {
    return String(props.tool.input);
  }
});

const statusLabel = computed(() => {
  switch (props.tool.status) {
    case 'waiting_approval':
      return t('tool.waiting_approval');
    case 'approved':
      return t('tool.approved');
    case 'rejected':
      return t('tool.rejected');
    case 'running':
      return t('tool.running');
    case 'succeeded':
      return t('tool.succeeded');
    case 'failed':
      return t('tool.failed');
    default:
      return t('tool.requested');
  }
});
</script>

<style scoped lang="less">
.nh-tool {
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-elevated);
  font-size: 12px;
}

.nh-tool__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nh-space-sm);
  padding: 8px 12px;
  cursor: pointer;
}

.nh-tool__name {
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-tool__status {
  color: var(--nh-color-text-secondary);
}

.nh-tool--failed .nh-tool__status {
  color: var(--nh-color-danger);
}

.nh-tool--succeeded .nh-tool__status {
  color: var(--nh-color-success);
}

.nh-tool__body {
  padding: 0 12px 12px;
}

.nh-tool__label {
  margin: 8px 0 4px;
  color: var(--nh-color-text-secondary);
}

.nh-tool__pre {
  max-height: 240px;
  overflow: auto;
  padding: 8px;
  border-radius: var(--nh-radius-sm);
  background: var(--nh-color-bg-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-tool__error {
  color: var(--nh-color-danger);
  white-space: pre-wrap;
}

.nh-tool__meta {
  color: var(--nh-color-text-secondary);
  word-break: break-all;
}
</style>
