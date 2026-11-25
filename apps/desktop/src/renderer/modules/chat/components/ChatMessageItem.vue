<template>
  <article
    v-if="message.role === 'system'"
    class="nh-message nh-message--system"
    :data-message-id="message.id"
    :class="{
      'nh-message--highlighted': highlighted,
      'nh-message--compaction': message.compactionNotice
    }"
  >
    <span class="nh-message__system-dot" />
    <span>{{ message.content }}</span>
  </article>
  <article
    v-else-if="
      message.content ||
      message.reasoning ||
      message.streaming ||
      timeline.length ||
      message.references?.length ||
      message.attachments?.length ||
      toolEntries.length ||
      askUsers.length ||
      message.files?.length ||
      orphanWorkspaceAuth
    "
    class="nh-message"
    :class="[
      `nh-message--${message.role}`,
      { 'nh-message--grouped': grouped, 'nh-message--highlighted': highlighted }
    ]"
    :data-message-id="message.id"
  >
    <div class="nh-message__body" :class="{ 'nh-message__body--editing': editing }">
      <div
        class="nh-message__bubble"
        :class="{
          'nh-message__bubble--tools':
            toolEntries.length > 0 || askUsers.some((ask) => ask.status === 'pending'),
          'nh-message__bubble--interruption': hasInterruption && !contentText && !timeline.length,
          'nh-message__bubble--editing': editing
        }"
      >
        <ChatMessageEditForm
          v-if="editing"
          :message="message"
          :session-id="sessionId"
          :actions-disabled="actionsDisabled"
          @save="saveEdit"
          @cancel="cancelEdit"
        />
        <AssistantMessageFlow
          v-else-if="message.role === 'assistant'"
          :message="message"
          :session-id="sessionId"
          :ask-users="askUsers"
          :approvals="approvals"
          :timeline="timeline"
          :tool-entries="toolEntries"
          :unmatched-asks="unmatchedAsks"
          :related-workspace-auth="relatedWorkspaceAuth"
          :orphan-workspace-auth="orphanWorkspaceAuth"
          :content-text="contentText"
          :is-typing="isTyping"
          :show-thinking="showThinking"
          :hide-stats="hideMessageStats"
          @answer-user="(requestId, answers) => emit('answer-user', requestId, answers)"
          @approve="(approvalId) => emit('approve', approvalId)"
          @reject="(approvalId) => emit('reject', approvalId)"
          @request-root="emit('request-root')"
          @allow-workspace="emit('allow-workspace')"
          @reject-workspace="emit('reject-workspace')"
        />
        <template v-else>
          <UserMessageContent
            v-if="message.content || message.references?.length || message.attachments?.length"
            :content="message.content"
            :references="message.references"
            :attachments="message.attachments"
            :session-id="sessionId"
          />
          <PluginSlot
            location="message.user.footer"
            :context="{
              location: 'message.user.footer',
              sessionId,
              messageId: message.id,
              runId: message.runId,
              role: 'user'
            }"
          />
        </template>
      </div>

      <ChatMessageActions
        v-if="!editing"
        :message="message"
        :session-id="sessionId"
        :is-last-assistant="isLastAssistant"
        :actions-disabled="actionsDisabled"
        :copy-text="copyText"
        :time-label="timeLabel"
        @edit="startEdit"
        @regenerate="emit('regenerate-message')"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 单条消息：用户、助手或系统提示，并挂载工具调用卡片。
 */

import { computed, ref } from 'vue';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import type { ChatApproval, ChatAskUser, ChatMessageView } from '../types';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import UserMessageContent from './UserMessageContent.vue';
import ChatMessageActions from './ChatMessageActions.vue';
import ChatMessageEditForm from './ChatMessageEditForm.vue';
import AssistantMessageFlow from './AssistantMessageFlow.vue';
import { hasStreamingText, shouldShowMessageThinking } from '../agent-generation';
import { formatMessageTime } from '../message-time';
import { useMessageClock } from '../use-message-clock';
import { locale, t } from '@/app/i18n';
import { useMessageFlow } from '../use-message-flow';
import { useMessageStreaming } from '../use-message-streaming';

const props = withDefaults(
  defineProps<{
    message: ChatMessageView;
    grouped?: boolean;
    highlighted?: boolean;
    askUsers?: ChatAskUser[];
    approvals?: ChatApproval[] | undefined;
    sessionId?: string | undefined;
    isLastAssistant?: boolean;
    actionsDisabled?: boolean;
    workspaceAuth?: WorkspaceAuthorizationRequest | null;
    workspaceAuthToolExists?: boolean;
    runThinking?: boolean;
    /** 子代理/嵌套消息不展示耗时与字数统计 */
    hideMessageStats?: boolean;
  }>(),
  {
    grouped: false,
    highlighted: false,
    askUsers: () => [],
    approvals: () => [],
    sessionId: undefined,
    isLastAssistant: false,
    actionsDisabled: false,
    workspaceAuth: null,
    workspaceAuthToolExists: false,
    runThinking: false,
    hideMessageStats: false
  }
);

const emit = defineEmits<{
  'content-growth': [];
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'edit-message': [content: string, references?: MessageFileReference[], attachmentIds?: string[]];
  'regenerate-message': [];
  'request-root': [];
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const editing = ref(false);
const { contentText, isTyping } = useMessageStreaming(
  () => props.message,
  () => emit('content-growth')
);
const {
  timeline,
  toolEntries,
  unmatchedAsks,
  relatedWorkspaceAuth,
  orphanWorkspaceAuth,
  hasInterruption,
  hasPendingAsk,
  copyText
} = useMessageFlow({
  message: () => props.message,
  askUsers: () => props.askUsers,
  approvals: () => props.approvals,
  sessionId: () => props.sessionId,
  workspaceAuth: () => props.workspaceAuth,
  workspaceAuthToolExists: () => props.workspaceAuthToolExists,
  isLastAssistant: () => Boolean(props.isLastAssistant)
});

/**
 * 进入用户消息编辑态；表单自行初始化引用与附件。
 */
const startEdit = (): void => {
  if (props.actionsDisabled || props.message.role !== 'user') return;
  editing.value = true;
};

/**
 * 提交编辑后的消息；父级会创建新的 Run。
 */
const saveEdit = (
  content: string,
  references?: MessageFileReference[],
  attachmentIds?: string[]
): void => {
  editing.value = false;
  emit('edit-message', content, references, attachmentIds);
};

const cancelEdit = (): void => {
  editing.value = false;
};

const showThinking = computed(
  () =>
    Boolean(props.runThinking) ||
    shouldShowMessageThinking({
      isTyping: isTyping.value,
      hasInterruption: hasInterruption.value,
      hasPendingAsk: hasPendingAsk.value,
      hasStreamingText: hasStreamingText(props.message, isTyping.value)
    })
);

const messageClock = useMessageClock();
const timeLabel = computed(() =>
  formatMessageTime(
    props.message.createdAt,
    locale.value,
    messageClock.value,
    t('session.groupToday'),
    t('session.groupYesterday')
  )
);
</script>

<style scoped lang="less">
.nh-message {
  display: flex;
  scroll-margin: 24px;
  gap: 12px;
  align-items: flex-start;
  border-radius: 14px;
  transition: background var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-message--grouped {
  margin-top: -12px;
}

.nh-message--highlighted {
  background: color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--nh-color-accent) 5%, transparent);
}

.nh-message__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nh-message--user {
  justify-content: flex-end;
}

.nh-message--user .nh-message__body {
  max-width: 640px;
  flex: 0 1 auto;
  align-items: flex-end;
}

.nh-message--user .nh-message__body--editing {
  width: min(520px, 100%);
  max-width: 100%;
}

.nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-surface-elevated) 72%, transparent);
  --bubble-border: var(--nh-border-subtle);

  position: relative;
  width: fit-content;
  max-width: 100%;
  padding: 10px 13px;
  border: 1px solid var(--bubble-border);
  border-radius: 16px;
  background: var(--bubble-bg);
}

.nh-message--assistant .nh-message__bubble {
  width: 100%;
  padding: 0;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
}

.nh-message--assistant .nh-message__bubble--tools {
  width: 100%;
}

.nh-message--assistant .nh-message__bubble--interruption {
  width: 100%;
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.nh-message--user .nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-color-accent) 6%, var(--nh-surface-base));
  --bubble-border: color-mix(in srgb, var(--nh-color-accent) 14%, var(--nh-border-subtle));

  padding: 12px 16px;
  box-shadow: var(--nh-highlight);
}

.nh-message__bubble--editing {
  width: 100%;
}

.nh-message--system {
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: var(--nh-surface-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.nh-message--compaction {
  width: min(100%, 820px);
  gap: 12px;
  padding: 2px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--nh-color-text-secondary) 72%, transparent);
  font-size: 11px;
  letter-spacing: 0.01em;
}

.nh-message--compaction::before,
.nh-message--compaction::after {
  height: 1px;
  flex: 1;
  min-width: 24px;
  background: linear-gradient(90deg, transparent, var(--nh-border-subtle));
  content: '';
}

.nh-message--compaction::after {
  transform: scaleX(-1);
}

.nh-message--compaction > span:last-child {
  max-width: 72%;
}

.nh-message__system-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--nh-color-warning);
}

.nh-message--compaction .nh-message__system-dot {
  display: none;
}
</style>
