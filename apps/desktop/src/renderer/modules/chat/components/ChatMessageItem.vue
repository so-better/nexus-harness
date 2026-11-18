<template>
  <article class="nh-message" :class="`nh-message--${message.role}`">
    <header class="nh-message__header">
      <span class="nh-message__role">{{ roleLabel }}</span>
    </header>
    <p v-if="message.content" class="nh-message__content">{{ message.content }}</p>
    <div v-if="message.toolCalls.length" class="nh-message__tools">
      <ToolCallCard v-for="tool in message.toolCalls" :key="tool.id" :tool="tool" />
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 单条消息：用户、助手或系统提示，并挂载工具调用卡片。
 */

import { computed } from 'vue';
import { t } from '@/app/i18n';
import type { ChatMessageView } from '../types';
import ToolCallCard from './ToolCallCard.vue';

const props = defineProps<{ message: ChatMessageView }>();

const roleLabel = computed(() => {
  if (props.message.role === 'user') return t('chat.user');
  if (props.message.role === 'assistant') return t('chat.assistant');
  return t('chat.system');
});
</script>

<style scoped lang="less">
.nh-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-message__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-message__role {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-message--user .nh-message__role {
  color: var(--nh-color-accent);
}

.nh-message--system .nh-message__role {
  color: var(--nh-color-warning);
}

.nh-message__content {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nh-message--user .nh-message__content {
  padding: 12px;
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-elevated);
}

.nh-message__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
