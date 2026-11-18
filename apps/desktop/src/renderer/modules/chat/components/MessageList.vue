<template>
  <div ref="viewport" class="nh-message-list">
    <div class="nh-message-list__stack">
      <ChatMessageItem
        v-for="(message, index) in messages"
        :key="message.id"
        :message="message"
        :grouped="isGrouped(index)"
        :highlighted="message.id === highlightedId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息列表：限制阅读宽度，并在新消息到达时滚动到底部。
 */

import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ChatMessageView } from '../types';
import ChatMessageItem from './ChatMessageItem.vue';

const props = defineProps<{
  messages: ChatMessageView[];
  focusMessageId?: string | undefined;
  focusToken?: number | undefined;
}>();

const viewport = ref<HTMLElement | null>(null);
const highlightedId = ref<string>();
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 连续助手消息共用首个头像与角色信息，减少重复视觉噪音。
 */
/**
 * 等待目标消息渲染后滚动并短暂高亮；跨会话切换时历史加载可能稍晚。
 */
const focusMessage = async (messageId: string): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await nextTick();
    const element = viewport.value?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      highlightedId.value = messageId;
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        if (highlightedId.value === messageId) highlightedId.value = undefined;
      }, 1600);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
};

watch(
  () => [props.focusMessageId, props.focusToken] as const,
  ([messageId, token], previous) => {
    if (!messageId || !token || token === previous?.[1]) return;
    void focusMessage(messageId);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (highlightTimer) clearTimeout(highlightTimer);
});

const isGrouped = (index: number): boolean => {
  const current = props.messages[index];
  const previous = props.messages[index - 1];
  return Boolean(
    current &&
    previous &&
    current.role === 'assistant' &&
    previous.role === 'assistant' &&
    current.createdAt - previous.createdAt < 10 * 60 * 1000
  );
};

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    viewport.value?.scrollTo({ top: viewport.value.scrollHeight, behavior: 'smooth' });
  }
);
</script>

<style scoped lang="less">
.nh-message-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 40px 32px;
}

.nh-message-list__stack {
  display: flex;
  width: 100%;
  max-width: 760px;
  flex-direction: column;
  gap: 28px;
  margin: 0 auto;
}
</style>
