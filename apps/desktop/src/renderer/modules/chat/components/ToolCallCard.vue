<template>
  <NCollapse class="nh-tool" :class="{ 'nh-tool--flush': flush }">
    <NCollapseItem :name="tool.id">
      <template #header>
        <div class="nh-tool__summary">
          <span class="nh-tool__identity">
            <span class="nh-tool__icon">
              <AppIcon :name="toolIcon" :size="14" />
            </span>
            <span class="nh-tool__name">{{ tool.name }}</span>
          </span>
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
import AppIcon from '@/components/AppIcon.vue';
import type { ChatToolCall } from '../types';

const props = withDefaults(defineProps<{ tool: ChatToolCall; flush?: boolean }>(), {
  flush: false
});

const toolIcon = computed<
  'file' | 'edit' | 'terminal' | 'globe' | 'spark' | 'settings' | 'history'
>(() => {
  if (['read_file', 'list_dir', 'glob', 'grep'].includes(props.tool.name)) return 'file';
  if (['write_file', 'apply_patch'].includes(props.tool.name)) return 'edit';
  if (props.tool.name === 'run_command') return 'terminal';
  if (props.tool.name === 'fetch' || props.tool.name.startsWith('search_')) return 'globe';
  if (props.tool.name === 'generate_image') return 'spark';
  if (props.tool.name === 'checkpoint') return 'history';
  return 'settings';
});

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

.nh-tool--flush {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.nh-tool__summary {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.nh-tool__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-tool__icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-tool__name {
  overflow: hidden;
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
