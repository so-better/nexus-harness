<template>
  <div ref="viewport" class="nh-message-list" @scroll="handleScroll">
    <div class="nh-message-list__stack">
      <ChatMessageItem
        v-for="(message, index) in messages"
        :key="message.id"
        :message="message"
        :grouped="isGrouped(index)"
        :highlighted="message.id === highlightedId"
        :ask-user="askForMessage(message.id)"
        :ask-first="askForMessage(message.id)?.merged === true"
        :is-last-assistant="message.id === lastAssistantId"
        :actions-disabled="actionsDisabled"
        @content-growth="handleContentGrowth"
        @answer-user="(requestId, answers) => emit('answer-user', requestId, answers)"
        @edit-message="(content) => emit('edit-message', message.id, content)"
        @regenerate-message="emit('regenerate-message', message.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息列表：限制阅读宽度，并在新消息到达时滚动到底部。
 */

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { AskUserAnswer } from '@shared/ask-user';
import { indexAskUsersByMessage } from '../ask-user-index';
import type { ChatAskUser, ChatMessageView } from '../types';
import ChatMessageItem from './ChatMessageItem.vue';

const emit = defineEmits<{
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  'edit-message': [messageId: string, content: string];
  'regenerate-message': [messageId: string];
}>();

const props = defineProps<{
  messages: ChatMessageView[];
  focusMessageId?: string | undefined;
  focusToken?: number | undefined;
  focusSessionId?: string | undefined;
  sessionId?: string | undefined;
  askUsers?: ChatAskUser[] | undefined;
  actionsDisabled?: boolean | undefined;
}>();

const viewport = ref<HTMLElement | null>(null);

const lastAssistantId = computed(
  () => [...props.messages].reverse().find((message) => message.role === 'assistant')?.id
);

/**
 * 按投影给出的 messageId 关联提问；同一消息有多次提问时保留最新一条。
 */
const asksByMessage = computed(() => indexAskUsersByMessage(props.askUsers ?? []));

const askForMessage = (messageId: string): ChatAskUser | undefined =>
  asksByMessage.value.get(messageId);
const highlightedId = ref<string>();
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let focusRequest = 0;
let focusReleaseTimer: ReturnType<typeof setTimeout> | undefined;
const focusing = ref(false);
const stickToBottom = ref(true);
const BOTTOM_THRESHOLD = 80;

/**
 * 等待目标消息渲染后滚动并短暂高亮；跨会话切换时历史加载可能稍晚。
 * 定位期间抑制自动吸底，避免历史加载后把视图再次拉到底部。
 */
const focusMessage = async (messageId: string, request: number): Promise<void> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (request !== focusRequest) return;
    await nextTick();
    if (request !== focusRequest) return;

    const element = viewport.value?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (element) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      highlightedId.value = messageId;
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        if (highlightedId.value === messageId) highlightedId.value = undefined;
      }, 1600);
      if (focusReleaseTimer) clearTimeout(focusReleaseTimer);
      focusReleaseTimer = setTimeout(() => {
        if (request === focusRequest) focusing.value = false;
      }, 600);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  if (request === focusRequest) focusing.value = false;
};

watch(
  () => [props.focusMessageId, props.focusToken, props.focusSessionId, props.sessionId] as const,
  ([messageId, token, focusSessionId, sessionId], previous) => {
    if (
      !messageId ||
      !token ||
      token === previous?.[1] ||
      !focusSessionId ||
      focusSessionId !== sessionId
    ) {
      return;
    }
    focusRequest += 1;
    focusing.value = true;
    highlightedId.value = undefined;
    void focusMessage(messageId, focusRequest);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  focusRequest += 1;
  if (highlightTimer) clearTimeout(highlightTimer);
  if (focusReleaseTimer) clearTimeout(focusReleaseTimer);
});

/**
 * 用户接近底部时恢复自动跟随；向上浏览时保持当前位置。
 */
/**
 * 流式文本增长时只在用户贴底时跟随，向上阅读时不打扰。
 */
const handleContentGrowth = (): void => {
  if (focusing.value || !stickToBottom.value) return;
  const view = viewport.value;
  if (!view) return;
  view.scrollTop = view.scrollHeight;
};

const handleScroll = (): void => {
  const view = viewport.value;
  if (!view) return;
  stickToBottom.value = view.scrollHeight - view.scrollTop - view.clientHeight <= BOTTOM_THRESHOLD;
};

/**
 * 滚动到最新消息。
 */
const scrollToLatest = (behavior: 'auto' | 'smooth' = 'smooth'): void => {
  const view = viewport.value;
  if (!view) return;
  view.scrollTo({ top: view.scrollHeight, behavior });
};

/**
 * 切换会话时回到最新消息，并重置跟随状态。
 */
watch(
  () => props.sessionId,
  async () => {
    if (props.focusSessionId !== props.sessionId) focusing.value = false;
    stickToBottom.value = true;
    await nextTick();
    if (!focusing.value) scrollToLatest('auto');
  },
  { immediate: true }
);

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
  () => props.askUsers?.filter((ask) => ask.status === 'pending').length ?? 0,
  async (count, previous) => {
    if (count <= (previous ?? 0)) return;
    await nextTick();
    if (!focusing.value && stickToBottom.value) scrollToLatest();
  }
);

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (focusing.value) return;

    // 用户自己发送消息时始终回到最新；其余新消息仅在贴底时跟随
    const last = props.messages.at(-1);
    if (last?.role !== 'user' && !stickToBottom.value) return;
    stickToBottom.value = true;
    scrollToLatest();
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
  max-width: 1040px;
  flex-direction: column;
  gap: 28px;
  margin: 0 auto;
}
</style>
