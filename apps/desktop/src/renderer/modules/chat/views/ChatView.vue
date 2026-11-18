<template>
  <main class="nh-chat">
    <header class="nh-chat__header">
      <div class="nh-chat__title-group">
        <h1 class="nh-chat__title">{{ session?.title ?? t('app.noSession') }}</h1>
        <NTag v-if="session" size="small" :type="statusType" :bordered="false">
          {{ statusLabel }}
        </NTag>
      </div>
    </header>

    <section v-if="!session || projection.messages.length === 0" class="nh-chat__empty">
      <EmptyStateHero :show-create="!session" @create="emit('create')" />
    </section>

    <MessageList v-else :messages="projection.messages" />

    <div v-if="pendingApprovals.length" class="nh-chat__approvals">
      <ApprovalCard
        v-for="approval in pendingApprovals"
        :key="approval.id"
        :approval="approval"
        @approve="emit('approve', approval.id)"
        @reject="emit('reject', approval.id)"
      />
    </div>

    <ComposerBox
      :disabled="Boolean(disabledReason)"
      :disabled-reason="disabledReason"
      :running="projection.running"
      :root-label="rootLabel"
      :providers="providers"
      :provider-id="providerId"
      @choose-root="emit('choose-root')"
      @update-provider="emit('update-provider', $event)"
      @send="emit('send', $event)"
      @stop="emit('stop')"
    />
  </main>
</template>

<script setup lang="ts">
/**
 * 会话主区：标题、消息流、审批与输入区。
 */

import { computed } from 'vue';
import { NTag } from 'naive-ui';
import type { ProviderPublic, SessionSummary } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import ApprovalCard from '../components/ApprovalCard.vue';
import ComposerBox from '../components/ComposerBox.vue';
import EmptyStateHero from '../components/EmptyStateHero.vue';
import MessageList from '../components/MessageList.vue';
import type { ChatProjection } from '../types';

const props = defineProps<{
  session?: SessionSummary | undefined;
  projection: ChatProjection;
  rootLabel: string;
  providers: ProviderPublic[];
  providerId?: string | undefined;
  disabledReason?: string | undefined;
}>();

const emit = defineEmits<{
  create: [];
  'choose-root': [];
  'update-provider': [id: string];
  send: [prompt: string];
  stop: [];
  approve: [approvalId: string];
  reject: [approvalId: string];
}>();

const pendingApprovals = computed(() =>
  props.projection.approvals.filter((approval) => approval.status === 'pending')
);

const statusLabel = computed(() => {
  if (!props.session) return t('app.idle');
  switch (props.projection.status) {
    case 'running':
      return t('session.status.running');
    case 'waiting_approval':
      return t('session.status.waiting_approval');
    case 'completed':
      return t('session.status.completed');
    case 'failed':
      return t('session.status.failed');
    case 'cancelled':
      return t('session.status.cancelled');
    default:
      return t('session.status.idle');
  }
});

const statusType = computed(() => {
  switch (props.projection.status) {
    case 'running':
      return 'info' as const;
    case 'waiting_approval':
      return 'warning' as const;
    case 'completed':
      return 'success' as const;
    case 'failed':
      return 'error' as const;
    default:
      return 'default' as const;
  }
});
</script>

<style scoped lang="less">
.nh-chat {
  display: flex;
  min-width: 0;
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

.nh-chat__title {
  overflow: hidden;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-chat__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.nh-chat__approvals {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: calc(100% - 64px);
  max-width: 820px;
  margin: 0 auto;
  padding: 8px 0 0;
}
</style>
