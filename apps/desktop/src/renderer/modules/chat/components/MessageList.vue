<template>
  <div ref="viewport" class="nh-message-list" @scroll="handleScroll">
    <div ref="stack" class="nh-message-list__stack">
      <template v-for="(message, index) in messages" :key="message.id">
        <div v-if="showDateDivider(index)" class="nh-message-list__date">
          {{ dateLabel(message.createdAt) }}
        </div>
        <ChatMessageItem
          :message="message"
          :grouped="isGrouped(index)"
          :highlighted="message.id === highlightedId"
          :ask-users="askForMessage(message.id)"
          :approvals="approvals"
          :session-id="sessionId"
          :is-last-assistant="message.id === lastAssistantId"
          :actions-disabled="actionsDisabled"
          :workspace-auth="workspaceAuth ?? null"
          :workspace-auth-tool-exists="workspaceAuthToolExists"
          :run-thinking="message.id === thinkingTargetId"
          @content-growth="handleContentGrowth"
          @answer-user="(requestId, answers) => emit('answer-user', requestId, answers)"
          @approve="emit('approve', $event)"
          @reject="emit('reject', $event)"
          @edit-message="
            (content, references, attachmentIds) =>
              emit('edit-message', message.id, content, references, attachmentIds)
          "
          @regenerate-message="emit('regenerate-message', message.id)"
          @request-root="emit('request-root')"
          @allow-workspace="emit('allow-workspace')"
          @reject-workspace="emit('reject-workspace')"
        />
      </template>
      <RunThinkingMessage v-if="showThinking && !thinkingTargetId" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息列表：限制阅读宽度，并在新消息到达时滚动到底部。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import { indexAskUsersByMessage } from '../ask-user-index';
import { formatMessageDay, isSameMessageDay } from '../message-time';
import { useMessageClock } from '../use-message-clock';
import { locale, t } from '@/app/i18n';
import { shouldShowRunThinking } from '../agent-generation';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import type { ChatApproval, ChatAskUser, ChatMessageView } from '../types';
import ChatMessageItem from './ChatMessageItem.vue';
import RunThinkingMessage from './RunThinkingMessage.vue';

const emit = defineEmits<{
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'edit-message': [
    messageId: string,
    content: string,
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ];
  'regenerate-message': [messageId: string];
  'request-root': [];
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const props = defineProps<{
  messages: ChatMessageView[];
  focusMessageId?: string | undefined;
  focusToken?: number | undefined;
  focusSessionId?: string | undefined;
  sessionId?: string | undefined;
  askUsers?: ChatAskUser[] | undefined;
  approvals?: ChatApproval[] | undefined;
  actionsDisabled?: boolean | undefined;
  workspaceAuth?: WorkspaceAuthorizationRequest | null | undefined;
  thinking?: boolean | undefined;
}>();

const viewport = ref<HTMLElement | null>(null);
const stack = ref<HTMLElement | null>(null);

const workspaceAuthToolExists = computed(() => {
  const toolCallId = props.workspaceAuth?.toolCallId;
  const parentToolCallId = props.workspaceAuth?.parentToolCallId;
  return Boolean(
    (toolCallId &&
      props.messages.some((message) => message.toolCalls.some((tool) => tool.id === toolCallId))) ||
    (parentToolCallId &&
      props.messages.some((message) =>
        message.toolCalls.some((tool) => tool.id === parentToolCallId)
      ))
  );
});

const messageClock = useMessageClock();

const showDateDivider = (index: number): boolean => {
  const current = props.messages[index];
  const previous = props.messages[index - 1];
  return Boolean(
    current && (!previous || !isSameMessageDay(current.createdAt, previous.createdAt))
  );
};

const dateLabel = (timestamp: number): string =>
  formatMessageDay(
    timestamp,
    locale.value,
    messageClock.value,
    t('session.groupToday'),
    t('session.groupYesterday')
  );

const lastAssistantId = computed(
  () =>
    [...props.messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.compactionNotice)?.id
);
const showThinking = computed(() => shouldShowRunThinking(Boolean(props.thinking), props.messages));
const thinkingTargetId = computed(() => {
  if (!showThinking.value) return undefined;
  const last = props.messages.at(-1);
  return last?.role === 'assistant' ? last.id : undefined;
});

/**
 * 按投影给出的 messageId 关联提问，同一消息保留全部提问。
 */
const asksByMessage = computed(() => indexAskUsersByMessage(props.askUsers ?? []));

const askForMessage = (messageId: string): ChatAskUser[] =>
  asksByMessage.value.get(messageId) ?? [];
const highlightedId = ref<string>();
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let resizeObserver: ResizeObserver | undefined;
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
    focusMessage(messageId, focusRequest).catch((error: unknown) => {
      console.error('定位消息失败', error);
    });
  },
  { immediate: true }
);

onMounted(() => {
  // 初始帧先贴底；ResizeObserver 只负责随后异步内容变高的补充滚动
  if (!focusing.value && stickToBottom.value) scrollToLatest('auto');
  if (typeof ResizeObserver === 'undefined' || !stack.value) return;
  // 历史消息中的图片、代码块和字体加载会晚于首次布局，内容变高时保持贴底
  resizeObserver = new ResizeObserver(() => {
    if (focusing.value || !stickToBottom.value) return;
    scrollToLatest('auto');
  });
  resizeObserver.observe(stack.value);
});

onBeforeUnmount(() => {
  focusRequest += 1;
  resizeObserver?.disconnect();
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
  // auto 用直接赋值，避免部分 Chromium 版本在首帧尚未完成布局时忽略 scrollTo
  if (behavior === 'auto') {
    view.scrollTop = view.scrollHeight;
    return;
  }
  view.scrollTo({ top: view.scrollHeight, behavior });
};

watch(showThinking, async (thinking) => {
  if (!thinking || focusing.value || !stickToBottom.value) return;
  await nextTick();
  // nextTick 期间用户可能已向上滚动或首个 token 已到达，不能覆盖该状态
  if (!showThinking.value || focusing.value || !stickToBottom.value) return;
  scrollToLatest();
});

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
    !current.compactionNotice &&
    !previous.compactionNotice &&
    current.createdAt - previous.createdAt < 10 * 60 * 1000 &&
    isSameMessageDay(current.createdAt, previous.createdAt)
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

    const last = props.messages.at(-1);
    // 用户自己发送消息时始终回到最新；其余新消息仅在贴底时跟随
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

.nh-message-list__date {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -8px 0;
  color: var(--nh-color-text-disabled);
  font-size: 11px;
  text-align: center;
}

.nh-message-list__date::before,
.nh-message-list__date::after {
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, transparent, var(--nh-border-subtle));
  content: '';
}

.nh-message-list__date::after {
  transform: scaleX(-1);
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
