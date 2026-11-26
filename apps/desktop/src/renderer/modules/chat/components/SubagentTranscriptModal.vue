<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('tool.subagentTranscript')"
    style="width: 760px"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <div class="nh-subagent-transcript">
      <p v-if="loading" class="nh-subagent-transcript__state">
        {{ t('tool.subagentTranscriptLoading') }}
      </p>
      <p v-else-if="error" class="nh-subagent-transcript__error">{{ error }}</p>
      <div v-else class="nh-subagent-transcript__list">
        <div v-if="approvals.length" class="nh-subagent-transcript__approvals">
          <p class="nh-subagent-transcript__label">{{ t('tool.subagentApprovals') }}</p>
          <div v-for="approval in approvals" :key="approval.approvalId" class="approval-row">
            <span class="approval-scope">{{ approval.scope }}</span>
            <span class="approval-decision">{{ decisionLabel(approval.decision) }}</span>
          </div>
        </div>
        <ChatMessageItem
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :session-id="sessionId"
          :actions-disabled="true"
        />
      </div>
    </div>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 子代理过程弹窗：读取完整对话 Artifact，用真实聊天组件只读渲染。
 */

import { defineAsyncComponent, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { t } from '@/app/i18n';
import { readArtifact, readArtifactMeta } from '../api/artifacts.api';
import { readSubagentTranscript, type SubagentTranscriptApproval } from '../subagent-transcript';
import type { ChatMessageView } from '../types';

const ChatMessageItem = defineAsyncComponent(() => import('./ChatMessageItem.vue'));

// 子代理过程可能包含大量工具输出；超过上限直接拒绝加载，避免阻塞渲染进程
const MAX_TRANSCRIPT_BYTES = 8_000_000;

const props = defineProps<{
  show: boolean;
  sessionId?: string | undefined;
  artifactId?: string | undefined;
}>();

const emit = defineEmits<{ 'update:show': [boolean] }>();

const loading = ref(false);
const error = ref<string>();
const messages = ref<ChatMessageView[]>([]);
const approvals = ref<SubagentTranscriptApproval[]>([]);

/**
 * 审批记录只做只读回看；实时审批状态仍以会话流为准。
 */
const decisionLabel = (decision?: SubagentTranscriptApproval['decision']): string => {
  if (decision === 'approved') return t('tool.subagentApprovalApproved');
  if (decision === 'rejected') return t('tool.subagentApprovalRejected');
  if (decision === 'expired') return t('tool.subagentApprovalExpired');
  return t('tool.subagentApprovalPending');
};

watch(
  () => [props.show, props.sessionId, props.artifactId] as const,
  async () => {
    if (!props.show || !props.sessionId || !props.artifactId) return;
    loading.value = true;
    error.value = undefined;
    try {
      const meta = await readArtifactMeta({
        sessionId: props.sessionId,
        artifactId: props.artifactId
      });
      if (meta.bytes > MAX_TRANSCRIPT_BYTES) {
        messages.value = [];
        approvals.value = [];
        error.value = t('tool.subagentTranscriptTooLarge');
        return;
      }
      const stored = await readArtifact({
        sessionId: props.sessionId,
        artifactId: props.artifactId
      });
      const view = readSubagentTranscript(props.sessionId, stored.content);
      messages.value = view.projection.messages;
      approvals.value = view.approvals;
    } catch (reason) {
      messages.value = [];
      approvals.value = [];
      error.value = reason instanceof Error ? reason.message : t('tool.subagentLoadFailed');
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.nh-subagent-transcript {
  display: flex;
  min-width: 0;
  max-height: 62vh;
  flex-direction: column;
  gap: 12px;
  overflow: hidden auto;
}

.nh-subagent-transcript__approvals {
  display: flex;
  padding: 8px;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: var(--nh-color-bg-elevated);
}

.nh-subagent-transcript__label {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.approval-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.approval-scope {
  overflow-wrap: anywhere;
}

.approval-decision {
  flex: none;
  color: var(--nh-color-text-secondary);
}

.nh-subagent-transcript__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nh-subagent-transcript__state {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-subagent-transcript__error {
  margin: 0;
  color: var(--nh-color-danger);
  font-size: 12px;
}
</style>
