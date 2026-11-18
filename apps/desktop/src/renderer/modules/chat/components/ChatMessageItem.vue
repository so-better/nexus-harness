<template>
  <article v-if="message.role === 'system'" class="nh-message nh-message--system">
    <span class="nh-message__system-dot" />
    <span>{{ message.content }}</span>
  </article>
  <article v-else class="nh-message" :class="`nh-message--${message.role}`">
    <NAvatar round :size="28" :style="avatarStyle">{{ avatarText }}</NAvatar>
    <div class="nh-message__body">
      <header class="nh-message__header">
        <span class="nh-message__role">{{ roleLabel }}</span>
        <span class="nh-message__time">{{ timeLabel }}</span>
      </header>
      <p v-if="message.content" class="nh-message__content">{{ message.content }}</p>
      <div v-if="message.toolCalls.length" class="nh-message__tools">
        <ToolCallCard v-for="tool in message.toolCalls" :key="tool.id" :tool="tool" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 单条消息：用户、助手或系统提示，并挂载工具调用卡片。
 */

import { computed } from 'vue';
import { NAvatar } from 'naive-ui';
import { t } from '@/app/i18n';
import type { ChatMessageView } from '../types';
import ToolCallCard from './ToolCallCard.vue';

const props = defineProps<{ message: ChatMessageView }>();

const roleLabel = computed(() => {
  if (props.message.role === 'user') return t('chat.user');
  if (props.message.role === 'assistant') return t('chat.assistant');
  return t('chat.system');
});

const avatarText = computed(() => (props.message.role === 'user' ? '你' : 'N'));

const avatarStyle = computed(() =>
  props.message.role === 'user'
    ? {
        background: 'var(--nh-color-bg-hover)',
        color: 'var(--nh-color-text-secondary)',
        fontSize: '12px'
      }
    : {
        background: 'var(--nh-color-accent)',
        color: 'var(--nh-color-bg-base)',
        fontSize: '12px',
        fontWeight: '600'
      }
);

const timeLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(props.message.createdAt)
);
</script>

<style scoped lang="less">
.nh-message {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.nh-message__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nh-message__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.nh-message__role {
  font-size: 12px;
  font-weight: 600;
}

.nh-message--user .nh-message__role {
  color: var(--nh-color-accent);
}

.nh-message__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-message__content {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.nh-message--user .nh-message__content {
  width: fit-content;
  max-width: 640px;
  padding: 10px 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: 14px;
  border-bottom-right-radius: 4px;
  background: var(--nh-color-bg-elevated);
  background: color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-base));
  box-shadow: var(--nh-highlight);
}

.nh-message__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}

.nh-message--system {
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: 999px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.nh-message__system-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nh-color-warning);
}
</style>
