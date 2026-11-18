<template>
  <div ref="viewport" class="nh-message-list">
    <div class="nh-message-list__stack">
      <ChatMessageItem
        v-for="(message, index) in messages"
        :key="message.id"
        :message="message"
        :grouped="isGrouped(index)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息列表：限制阅读宽度，并在新消息到达时滚动到底部。
 */

import { nextTick, ref, watch } from 'vue';
import type { ChatMessageView } from '../types';
import ChatMessageItem from './ChatMessageItem.vue';

const props = defineProps<{ messages: ChatMessageView[] }>();

const viewport = ref<HTMLElement | null>(null);

/**
 * 连续助手消息共用首个头像与角色信息，减少重复视觉噪音。
 */
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
