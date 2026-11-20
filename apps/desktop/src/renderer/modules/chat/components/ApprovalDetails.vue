<template>
  <div class="nh-approval-details">
    <div v-if="path" class="nh-approval__field">
      <span class="nh-approval__label">{{ t('chat.approvalPath') }}</span>
      <code class="nh-approval__value">{{ path }}</code>
    </div>
    <div v-if="command" class="nh-approval__field">
      <pre class="nh-approval__pre nh-approval__pre--command">{{ command }}</pre>
    </div>
    <div v-if="prompt" class="nh-approval__field">
      <span class="nh-approval__label">{{ t('chat.approvalPrompt') }}</span>
      <p class="nh-approval__text">{{ prompt }}</p>
    </div>
    <div v-if="query" class="nh-approval__field">
      <span class="nh-approval__label">{{ t('chat.approvalQuery') }}</span>
      <p class="nh-approval__text">{{ query }}</p>
    </div>
    <div v-if="oldText !== undefined || newText !== undefined" class="nh-approval__field">
      <span class="nh-approval__label">{{ t('chat.approvalDiff') }}</span>
      <div class="nh-approval__diff">
        <pre v-if="oldText" class="nh-approval__pre nh-approval__pre--removed">- {{ oldText }}</pre>
        <pre v-if="newText" class="nh-approval__pre nh-approval__pre--added">+ {{ newText }}</pre>
      </div>
    </div>
    <div v-else-if="content" class="nh-approval__field">
      <span class="nh-approval__label">{{ t('chat.approvalContent') }}</span>
      <pre class="nh-approval__pre">{{ content }}</pre>
    </div>
    <details class="nh-approval__raw">
      <summary>{{ t('chat.approvalRaw') }}</summary>
      <pre class="nh-approval__pre">{{ inputPreview }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
/**
 * 审批详情：展示命令、路径、补丁或写入内容。
 */

import { computed } from 'vue';
import type { ChatToolCall } from '../types';
import { t } from '@/app/i18n';

const props = defineProps<{ tool: ChatToolCall }>();
const input = computed<Record<string, unknown>>(() =>
  props.tool.input && typeof props.tool.input === 'object'
    ? (props.tool.input as Record<string, unknown>)
    : {}
);
const stringValue = (key: string): string | undefined =>
  typeof input.value[key] === 'string' ? (input.value[key] as string) : undefined;
const path = computed(() => stringValue('path'));
const command = computed(() => stringValue('command'));
const prompt = computed(() => stringValue('prompt'));
const query = computed(() => stringValue('query'));
const content = computed(() => stringValue('content'));
const oldText = computed(() => stringValue('oldText'));
const newText = computed(() => stringValue('newText'));
const inputPreview = computed(() => JSON.stringify(props.tool.input, null, 2) ?? '');
</script>

<style scoped lang="less">
.nh-approval__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  margin-top: 9px;
}

.nh-approval__label {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-approval__text {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.nh-approval__raw {
  margin-top: 9px;
}

.nh-approval__raw summary {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.nh-approval__value {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.5;
}

.nh-approval__pre {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 7px 9px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 7px;
  background: var(--nh-surface-elevated);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-approval__pre--command {
  padding: 12px 14px;
  border-color: color-mix(in srgb, var(--nh-color-code-text) 12%, transparent);
  background: var(--nh-color-code-bg);
  color: var(--nh-color-code-text);
  font-size: 12px;
  line-height: 1.6;
}

.nh-approval__diff {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nh-approval__pre--removed {
  border-color: color-mix(in srgb, var(--nh-color-danger) 24%, var(--nh-border-subtle));
  color: var(--nh-color-danger);
}

.nh-approval__pre--added {
  border-color: color-mix(in srgb, var(--nh-color-success) 24%, var(--nh-border-subtle));
  color: var(--nh-color-success);
}

.nh-approval__raw .nh-approval__pre {
  margin-top: 6px;
}
</style>
