<template>
  <main class="nh-chat">
    <header v-if="session" class="nh-chat__header">
      <div class="nh-chat__title-group">
        <span class="nh-chat__session-icon">
          <AppIcon name="message" :size="14" />
        </span>
        <h1 class="nh-chat__title">{{ session.title }}</h1>
        <NTag size="small" :color="sessionStatusTagColor(session.status)" :bordered="false">
          {{ sessionStatusLabel(session.status) }}
        </NTag>
      </div>
    </header>

    <SessionEmptyView
      v-if="isEmpty"
      :disabled-reason="disabledReason"
      :running="projection.running"
      :roots="roots"
      :providers="providers"
      :models="models"
      :mode="mode"
      :session-id="session?.id"
      :provider-id="providerId"
      :model-id="modelId"
      @choose-root="emit('choose-root')"
      @remove-root="emit('remove-root', $event)"
      @update-provider="emit('update-provider', $event)"
      @update-model="emit('update-model', $event)"
      @update-mode="emit('update-mode', $event)"
      @open-settings="emit('open-settings')"
      @send="(prompt, images, references) => emit('send', prompt, images, references)"
      @stop="emit('stop')"
    />

    <template v-else>
      <MessageList
        :messages="projection.messages"
        :focus-message-id="focusMessageId"
        :focus-token="focusToken"
        :focus-session-id="focusSessionId"
        :session-id="session?.id"
        :ask-users="projection.askUsers"
        :approvals="projection.approvals"
        :actions-disabled="projection.running"
        @answer-user="(requestId, answers) => emit('answer-user', requestId, answers)"
        @approve="emit('approve', $event)"
        @reject="emit('reject', $event)"
        @edit-message="
          (messageId, content, references) => emit('edit-message', messageId, content, references)
        "
        @regenerate-message="(messageId) => emit('regenerate-message', messageId)"
        @request-root="emit('request-root')"
      />

      <div class="nh-chat__bottom">
        <NButton
          v-if="pendingApprovals.length"
          size="small"
          secondary
          class="nh-chat__approval-jump"
          @click="focusApproval"
        >
          <template #icon><AppIcon name="alert" :size="14" /></template>
          {{ t('chat.approvalJump') }} {{ pendingApprovals.length }}
        </NButton>
        <ComposerBox
          :disabled="Boolean(disabledReason)"
          :disabled-reason="disabledReason"
          :running="projection.running"
          :roots="roots"
          :providers="providers"
          :models="models"
          :mode="mode"
          :session-id="session?.id"
          :provider-id="providerId"
          :model-id="modelId"
          @choose-root="emit('choose-root')"
          @remove-root="emit('remove-root', $event)"
          @update-provider="emit('update-provider', $event)"
          @update-model="emit('update-model', $event)"
          @update-mode="emit('update-mode', $event)"
          @send="(prompt, images, references) => emit('send', prompt, images, references)"
          @stop="emit('stop')"
        />
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
/**
 * 会话主区：欢迎页、消息流、审批与输入区。
 */

import { computed } from 'vue';
import { NButton, NTag } from 'naive-ui';
import type {
  AgentMode,
  ProviderModel,
  ProviderPublic,
  SessionRoot,
  SessionSummary
} from '@shared/ipc/contracts';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import { t } from '@/app/i18n';
import { sessionStatusLabel, sessionStatusTagColor } from '@/app/session-status';
import AppIcon from '@/components/AppIcon.vue';
import ComposerBox from '../components/ComposerBox.vue';
import MessageList from '../components/MessageList.vue';
import SessionEmptyView from '../components/SessionEmptyView.vue';
import type { ChatProjection } from '../types';

const props = defineProps<{
  session?: SessionSummary | undefined;
  projection: ChatProjection;
  roots: SessionRoot[];
  providers: ProviderPublic[];
  models: ProviderModel[];
  mode: AgentMode;
  providerId?: string | undefined;
  modelId?: string | undefined;
  disabledReason?: string | undefined;
  focusMessageId?: string | undefined;
  focusToken?: number | undefined;
  focusSessionId?: string | undefined;
}>();

const emit = defineEmits<{
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
  'open-settings': [];
  send: [prompt: string, imagePaths?: string[], references?: MessageFileReference[]];
  stop: [];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  'edit-message': [messageId: string, content: string, references?: MessageFileReference[]];
  'regenerate-message': [messageId: string];
  'request-root': [];
}>();

const isEmpty = computed(() => !props.session || props.projection.messages.length === 0);
const pendingApprovals = computed(() =>
  props.projection.approvals.filter((approval) => approval.status === 'pending')
);

/**
 * 跳转到第一条待审批的工具卡片。
 */
const focusApproval = (): void => {
  const approval = pendingApprovals.value[0];
  if (!approval) return;
  const node =
    document.querySelector<HTMLElement>(`[data-approval-id="${approval.id}"]`) ??
    [...document.querySelectorAll<HTMLElement>('[data-tool-call-id]')].find(
      (element) => element.dataset['toolCallId'] === approval.toolCallId
    );
  node?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};
</script>

<style scoped lang="less">
.nh-chat {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  background: var(--nh-color-bg-base);
}

.nh-chat__header {
  display: flex;
  height: 56px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 32px;
  border-bottom: 1px solid var(--nh-color-border);
}

.nh-chat__title-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-chat__session-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-chat__title {
  overflow: hidden;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-chat__bottom {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 16px;
}

.nh-chat__approval-jump {
  align-self: center;
}
</style>
