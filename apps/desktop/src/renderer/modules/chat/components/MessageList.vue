<template>
  <div ref="viewport" class="nh-message-list">
    <ChatMessageItem v-for="message in messages" :key="message.id" :message="message" />
  </div>
</template>

<script setup lang="ts">
/**
 * 消息列表：新消息到达时滚动到底部。
 */

import { nextTick, ref, watch } from 'vue';
import type { ChatMessageView } from '../types';
import ChatMessageItem from './ChatMessageItem.vue';

const props = defineProps<{ messages: ChatMessageView[] }>();

const viewport = ref<HTMLElement | null>(null);

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
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 24px;
  overflow: auto;
  padding: 24px;
}
</style>
