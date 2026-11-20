<template>
  <NCollapse v-model:expanded-names="expandedNames" class="nh-tool">
    <NCollapseItem :name="tool.id">
      <template #header>
        <div class="nh-tool__summary">
          <span class="nh-tool__identity">
            <span class="nh-tool__icon">
              <AppIcon :name="toolIcon" :size="14" />
            </span>
            <span class="nh-tool__name" :title="tool.name">{{ tool.name }}</span>
          </span>
          <span class="nh-tool__tail">
            <span class="nh-tool__status" :class="'nh-tool__status--' + statusTone">
              <span class="nh-tool__dot" />
              {{ statusLabel }}
            </span>
            <AppIcon
              :name="expandedNames.includes(tool.id) ? 'chevron-up' : 'chevron-down'"
              :size="14"
            />
          </span>
        </div>
      </template>
      <div class="nh-tool__body">
        <section class="nh-tool__block">
          <div class="nh-tool__block-head">
            <span class="nh-tool__label">{{ t('tool.input') }}</span>
            <NButton text size="tiny" @click="copyText('input', inputText)">
              <template #icon><AppIcon name="copy" :size="12" /></template>
              {{ copied === 'input' ? t('chat.copied') : t('chat.copy') }}
            </NButton>
          </div>
          <pre class="nh-tool__pre">{{ inputText }}</pre>
        </section>
        <section v-if="tool.output" class="nh-tool__block">
          <div class="nh-tool__block-head">
            <span class="nh-tool__label">{{ t('tool.output') }}</span>
            <NButton text size="tiny" @click="copyText('output', tool.output)">
              <template #icon><AppIcon name="copy" :size="12" /></template>
              {{ copied === 'output' ? t('chat.copied') : t('chat.copy') }}
            </NButton>
          </div>
          <pre class="nh-tool__pre">{{ tool.output }}</pre>
        </section>
        <div v-if="tool.error" class="nh-tool__error">
          <span class="nh-tool__error-text">
            {{ tool.error.code }}: {{ tool.error.message }}
          </span>
          <NButton
            v-if="needsAuthorization"
            class="nh-tool__authorize"
            text
            type="error"
            size="tiny"
            strong
            @click="emit('authorize-root')"
          >
            {{ t('tool.authorizeRootAction') }} →
          </NButton>
        </div>
        <ToolArtifactCard
          v-if="tool.artifactId"
          :session-id="sessionId"
          :artifact-id="tool.artifactId"
        />
        <PluginSlot
          location="toolcall.body"
          :context="{
            location: 'toolcall.body',
            sessionId,
            messageId,
            runId,
            toolCallId: tool.id
          }"
        />
      </div>
      <PluginSlot
        location="toolcall.footer"
        :context="{
          location: 'toolcall.footer',
          sessionId,
          messageId,
          runId,
          toolCallId: tool.id
        }"
      />
    </NCollapseItem>
  </NCollapse>
</template>

<script setup lang="ts">
/**
 * 工具调用卡片：折叠展示参数、输出、错误与产物引用。
 */

import { computed, onBeforeUnmount, ref } from 'vue';
import { NButton, NCollapse, NCollapseItem } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChatToolCall } from '../types';
import ToolArtifactCard from './ToolArtifactCard.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';

const props = withDefaults(
  defineProps<{
    tool: ChatToolCall;
    /** 初始展开状态；用于预览/调试，也可用于后续自动展开失败工具。 */
    defaultExpanded?: boolean;
    sessionId?: string | undefined;
    messageId?: string | undefined;
    runId?: string | undefined;
  }>(),
  {
    defaultExpanded: false,
    sessionId: undefined,
    messageId: undefined,
    runId: undefined
  }
);

const emit = defineEmits<{ 'authorize-root': [] }>();

const expandedNames = ref<Array<string | number>>(
  props.defaultExpanded ? [props.tool.id] : []
);

const copied = ref<'input' | 'output'>();
let copyTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 复制参数或输出；剪贴板不可用时静默，不影响浏览。
 */
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});

const copyText = async (kind: 'input' | 'output', text: string): Promise<void> => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = kind;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      if (copied.value === kind) copied.value = undefined;
    }, 1200);
  } catch {
    // 剪贴板权限不可用时保持静默
  }
};

const toolIcon = computed<
  'file' | 'edit' | 'terminal' | 'globe' | 'spark' | 'settings' | 'history'
>(() => {
  if (
    [
      'read_file',
      'list_dir',
      'glob',
      'grep',
      'save_file',
      'save_word',
      'save_excel',
      'save_ppt',
      'save_pdf'
    ].includes(props.tool.name)
  )
    return 'file';
  if (['write_file', 'apply_patch'].includes(props.tool.name)) return 'edit';
  if (props.tool.name === 'run_command') return 'terminal';
  if (
    props.tool.name === 'fetch' ||
    props.tool.name.startsWith('search_') ||
    props.tool.name === 'generate_image'
  )
    return 'globe';
  if (props.tool.name.startsWith('search_skill') || props.tool.name === 'read_skill')
    return 'spark';
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
    case 'expired':
      return t('tool.expired');
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

const needsAuthorization = computed(
  () =>
    props.tool.error?.code === 'PATH_OUTSIDE_ROOT' ||
    props.tool.error?.code === 'TOOL_WORKSPACE_REQUIRED'
);

const statusTone = computed<'success' | 'error' | 'warning' | 'info'>(() => {
  switch (props.tool.status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'rejected':
      return 'error';
    case 'waiting_approval':
    case 'requested':
    case 'expired':
      return 'warning';
    default:
      return 'info';
  }
});
</script>

<style scoped lang="less">
.nh-tool {
  padding: 0;
  border: 0;
  background: transparent;
}

.nh-tool :deep(.n-collapse-item) {
  margin: 0;
  border: 0;
}

/* 覆盖 Naive Collapse 默认间距，工具行使用紧凑布局 */
.nh-tool :deep(.n-collapse-item__header) {
  min-height: 0;
  margin: 0 -8px;
  padding: 4px 8px !important;
  border: 0;
  border-radius: 8px;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-tool :deep(.n-collapse-item__header:hover) {
  background: var(--nh-color-bg-hover);
}

.nh-tool :deep(.n-collapse-item__header-main) {
  width: 100%;
}

/* 覆盖 Naive Collapse 默认内容间距，避免展开内容离头部过远 */
.nh-tool :deep(.n-collapse-item__content-inner) {
  padding: 0 !important;
}

/* 使用自定义 chevron，隐藏 Naive 默认箭头 */
.nh-tool :deep(.n-collapse-item-arrow) {
  display: none !important;
}

.nh-tool__summary {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
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
  width: 22px;
  height: 22px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-tool__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-tool__tail {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
}

.nh-tool__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.nh-tool__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.nh-tool__status--success .nh-tool__dot {
  background: var(--nh-color-success);
}

.nh-tool__status--error .nh-tool__dot {
  background: var(--nh-color-danger);
}

.nh-tool__status--warning .nh-tool__dot {
  background: var(--nh-color-warning);
}

.nh-tool__status--info .nh-tool__dot {
  background: var(--nh-color-accent);
}

.nh-tool__body {
  padding: 2px 0 12px 30px;
}

.nh-tool__block {
  overflow: hidden;
  margin-top: 6px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}

.nh-tool__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
}

.nh-tool__label {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-tool__pre {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 10px 12px;
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-tool__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-danger) 7%, transparent);
  color: var(--nh-color-danger);
  font-size: 11px;
  line-height: 1.5;
}

.nh-tool__error-text {
  min-width: 0;
  white-space: pre-wrap;
}

.nh-tool__authorize {
  flex: none;
}

.nh-tool__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}
</style>
