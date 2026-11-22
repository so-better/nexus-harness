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
      <div class="nh-chat__header-actions">
        <PluginSlot
          location="session.header.actions"
          :context="{
            location: 'session.header.actions',
            sessionId: session.id,
            usage: projection.usage
          }"
        />
        <NDropdown
          trigger="click"
          placement="bottom-end"
          :options="exportOptions"
          :menu-props="dropdownMenuProps"
          scrollable
          @select="selectExport"
        >
          <NButton
            type="primary"
            text
            :loading="exporting"
            :disabled="exporting"
            :title="t('session.export')"
          >
            <template #icon><AppIcon name="export" :size="15" /></template>
            {{ t('session.export') }}
            <AppIcon name="chevron-down" :size="12" />
          </NButton>
        </NDropdown>
      </div>
    </header>

    <SessionEmptyView
      v-if="isEmpty"
      :disabled-reason="disabledReason"
      :running="visualRunning"
      :roots="roots"
      :providers="providers"
      :models="models"
      :mode="mode"
      :approval-policy="session?.approvalPolicy ?? 'ask'"
      :session-id="session?.id"
      :ensure-session="ensureSession"
      :provider-id="providerId"
      :model-id="modelId"
      @choose-root="emit('choose-root')"
      @remove-root="emit('remove-root', $event)"
      @update-provider="emit('update-provider', $event)"
      @update-model="emit('update-model', $event)"
      @update-mode="emit('update-mode', $event)"
      @update-approval-policy="emit('update-approval-policy', $event)"
      @open-settings="emit('open-settings')"
      @send="
        (prompt, images, references, attachmentIds) =>
          emit('send', prompt, images, references, attachmentIds)
      "
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
        :thinking="isThinking"
        :actions-disabled="visualRunning"
        :workspace-auth="workspaceAuth"
        @answer-user="(requestId, answers) => emit('answer-user', requestId, answers)"
        @approve="emit('approve', $event)"
        @reject="emit('reject', $event)"
        @edit-message="
          (messageId, content, references, attachmentIds) =>
            emit('edit-message', messageId, content, references, attachmentIds)
        "
        @regenerate-message="(messageId) => emit('regenerate-message', messageId)"
        @request-root="emit('request-root')"
        @allow-workspace="emit('allow-workspace')"
        @reject-workspace="emit('reject-workspace')"
      />

      <div class="nh-chat__bottom">
        <div v-if="workspaceAuth || pendingApprovals.length" class="nh-chat__interruptions">
          <NButton
            v-if="workspaceAuth"
            type="primary"
            secondary
            round
            size="small"
            @click="focusWorkspaceAuth"
          >
            <template #icon><AppIcon name="folder" :size="14" /></template>
            {{ t('workspaceAuth.jump') }}
          </NButton>
          <NButton
            v-if="pendingApprovals.length"
            type="warning"
            secondary
            round
            size="small"
            @click="focusApproval"
          >
            <template #icon><AppIcon name="alert" :size="14" /></template>
            {{ t('chat.approvalJump') }} {{ pendingApprovals.length }}
          </NButton>
        </div>
        <ComposerBox
          :disabled="Boolean(disabledReason)"
          :disabled-reason="disabledReason"
          :running="visualRunning"
          :roots="roots"
          :providers="providers"
          :models="models"
          :mode="mode"
          :approval-policy="session?.approvalPolicy ?? 'ask'"
          :session-id="session?.id"
          :ensure-session="ensureSession"
          :usage="projection.usage"
          :provider-id="providerId"
          :model-id="modelId"
          @choose-root="emit('choose-root')"
          @remove-root="emit('remove-root', $event)"
          @update-provider="emit('update-provider', $event)"
          @update-model="emit('update-model', $event)"
          @update-mode="emit('update-mode', $event)"
          @update-approval-policy="emit('update-approval-policy', $event)"
          @send="
            (prompt, images, references, attachmentIds) =>
              emit('send', prompt, images, references, attachmentIds)
          "
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

import { dropdownMenuProps } from '@/app/menu-props';
import { computed, nextTick, watch } from 'vue';
import { NButton, NDropdown, NTag, type DropdownOption } from 'naive-ui';
import type {
  AgentMode,
  ApprovalPolicy,
  SessionExportFormat,
  ProviderModel,
  ProviderPublic,
  SessionRoot,
  SessionSummary,
  WorkspaceAuthorizationRequest
} from '@shared/ipc/contracts';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import { t } from '@/app/i18n';
import { sessionStatusLabel, sessionStatusTagColor } from '@/app/session-status';
import AppIcon from '@/components/AppIcon.vue';
import ComposerBox from '../components/ComposerBox.vue';
import MessageList from '../components/MessageList.vue';
import SessionEmptyView from '../components/SessionEmptyView.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import { isAgentThinking } from '../agent-generation';
import type { ChatProjection } from '../types';

const props = defineProps<{
  session?: SessionSummary | undefined;
  projection: ChatProjection;
  running?: boolean | undefined;
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
  exporting?: boolean | undefined;
  workspaceAuth?: WorkspaceAuthorizationRequest | null | undefined;
  ensureSession: () => Promise<string | undefined>;
}>();

const emit = defineEmits<{
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
  'update-approval-policy': [policy: ApprovalPolicy];
  'open-settings': [];
  send: [
    prompt: string,
    imagePaths?: string[],
    references?: MessageFileReference[],
    attachmentIds?: string[]
  ];
  stop: [];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
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
  export: [format: SessionExportFormat];
}>();

const visualRunning = computed(() => props.running || props.projection.running);
const starting = computed(() => Boolean(props.running) && !props.projection.running);
const isEmpty = computed(() => !props.session || props.projection.messages.length === 0);
const pendingApprovals = computed(() =>
  props.projection.approvals.filter((approval) => approval.status === 'pending')
);
const isThinking = computed(() =>
  isAgentThinking(props.projection, Boolean(props.workspaceAuth), starting.value)
);

/**
 * 跳转到当前目录授权卡，避免长会话里用户看不到阻塞操作。
 */
const focusWorkspaceAuth = (): void => {
  const request = props.workspaceAuth;
  if (!request) return;
  const node = document.querySelector<HTMLElement>(
    `[data-workspace-auth-id="${request.requestId}"]`
  );
  node?.scrollIntoView({ block: 'start', behavior: 'smooth' });
};

watch(
  () => props.workspaceAuth?.requestId,
  (next, previous) => {
    if (!next || next === previous) return;
    nextTick(() => focusWorkspaceAuth());
  },
  { immediate: true }
);

const exportOptions: DropdownOption[] = [
  { key: 'markdown', label: 'Markdown' },
  { key: 'html', label: 'HTML' },
  { key: 'pdf', label: 'PDF' }
];

const selectExport = (key: string | number): void => {
  if (props.exporting) return;
  emit('export', key as SessionExportFormat);
};

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

/**
 * 新审批到达时把会话流滚到审批卡片，避免用户看不到阻塞操作。
 */
watch(
  () => pendingApprovals.value.map((approval) => approval.id).join('|'),
  (next, previous) => {
    if (!next) return;
    const known = new Set(previous ? previous.split('|') : []);
    if (previous !== undefined && !next.split('|').some((id) => !known.has(id))) return;
    nextTick(() => focusApproval());
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.nh-chat {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  background: var(--nh-surface-base);
}

.nh-chat__header {
  display: flex;
  height: 56px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 32px;
  border-bottom: 1px solid var(--nh-border-subtle);
}

.nh-chat__title-group {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-chat__header-actions {
  display: flex;
  flex: none;
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

.nh-chat__interruptions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
</style>
