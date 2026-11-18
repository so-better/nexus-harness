<template>
  <NCollapse class="nh-tool">
    <NCollapseItem :name="tool.id">
      <template #header>
        <div class="nh-tool__summary">
          <span class="nh-tool__name">{{ tool.name }}</span>
          <NTag size="tiny" :type="statusType" :bordered="false">{{ statusLabel }}</NTag>
        </div>
      </template>
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
    </NCollapseItem>
  </NCollapse>
</template>

<script setup lang="ts">
/**
 * 工具调用卡片：折叠展示参数、输出、错误与产物引用。
 */

import { computed } from 'vue';
import { NCollapse, NCollapseItem, NTag } from 'naive-ui';
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

const statusType = computed(() => {
  switch (props.tool.status) {
    case 'succeeded':
      return 'success' as const;
    case 'failed':
    case 'rejected':
      return 'error' as const;
    case 'waiting_approval':
    case 'requested':
      return 'warning' as const;
    default:
      return 'info' as const;
  }
});
</script>

<style scoped lang="less">
.nh-tool {
  padding: 0 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-elevated);
}

.nh-tool__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.nh-tool__name {
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-tool__body {
  padding-bottom: 12px;
}

.nh-tool__label {
  margin: 8px 0 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-tool__pre {
  max-height: 240px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--nh-radius-sm);
  background: var(--nh-color-bg-base);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-tool__error {
  color: var(--nh-color-danger);
  font-size: 12px;
  white-space: pre-wrap;
}

.nh-tool__meta {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
