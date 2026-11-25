<template>
  <div
    ref="root"
    class="nh-subagent-timeline"
    :class="{ 'nh-subagent-timeline--blocking': hasBlocking }"
  >
    <ChatMessageItem
      v-for="message in projection.messages"
      :key="message.id"
      :message="message"
      :session-id="sessionId"
      :approvals="projection.approvals"
      :workspace-auth="workspaceAuth ?? null"
      :workspace-auth-tool-exists="Boolean(workspaceAuth)"
      :actions-disabled="true"
      @approve="(approvalId) => emit('approve', approvalId)"
      @reject="(approvalId) => emit('reject', approvalId)"
      @allow-workspace="emit('allow-workspace')"
      @reject-workspace="emit('reject-workspace')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 子代理实时时间线：用真实消息组件只读渲染子代理投影。
 * 异步引入 ChatMessageItem，避免与 ToolCallCard 形成静态循环依赖。
 */

import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import type { ChatProjection } from '../types';

const ChatMessageItem = defineAsyncComponent(() => import('./ChatMessageItem.vue'));

const props = defineProps<{
  projection: ChatProjection;
  sessionId?: string | undefined;
  workspaceAuth?: WorkspaceAuthorizationRequest | null;
}>();

const emit = defineEmits<{
  approve: [approvalId: string];
  reject: [approvalId: string];
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const root = ref<HTMLElement>();
const pendingApprovals = computed(() =>
  props.projection.approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => approval.id)
    .join('|')
);
const hasBlocking = computed(() =>
  Boolean(pendingApprovals.value || props.workspaceAuth?.requestId)
);

/**
 * 审批/目录授权出现时滚到阻塞项，避免藏在子代理时间线滚动区之外。
 */
watch(
  [hasBlocking, pendingApprovals, () => props.workspaceAuth?.requestId],
  async () => {
    await nextTick();
    const container = root.value;
    if (!container) return;
    if (!hasBlocking.value) {
      container.scrollTop = 0;
      return;
    }
    const target = container.querySelector<HTMLElement>(
      '[data-approval-id], [data-workspace-auth-id]'
    );
    if (!target) return;
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      8;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.nh-subagent-timeline {
  display: flex;
  width: 100%;
  min-width: 0;
  max-height: 420px;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  overflow-anchor: none;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--nh-border-subtle) 80%, transparent);
  border-radius: 9px;
  background: var(--nh-color-bg-base);
}

// 嵌套内容降一级：更紧凑的正文、推理与工具，避免抢占父会话视觉权重
.nh-subagent-timeline--blocking {
  max-height: none;
  overflow-y: visible;
}

.nh-subagent-timeline :deep(.nh-message) {
  gap: 8px;
}

.nh-subagent-timeline :deep(.nh-message__body) {
  gap: 6px;
}

.nh-subagent-timeline :deep(.nh-message__flow) {
  gap: 10px;
}

.nh-subagent-timeline :deep(.nh-message__actions) {
  display: none;
}

.nh-subagent-timeline :deep(.nh-markdown) {
  font-size: 13px;
  line-height: 1.65;
}

.nh-subagent-timeline :deep(.nh-reasoning__header) {
  font-size: 11px;
}

.nh-subagent-timeline :deep(.nh-reasoning__body) {
  padding: 6px 0 0 12px;
}

.nh-subagent-timeline :deep(.nh-reasoning__body .nh-markdown) {
  font-size: 11px;
}

.nh-subagent-timeline :deep(.nh-message--user .nh-message__bubble) {
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
}

.nh-subagent-timeline :deep(.nh-authorization) {
  padding: 12px;
  border-radius: 9px;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 0 10px;
  box-shadow: none;
}

.nh-subagent-timeline :deep(.nh-authorization__icon) {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.nh-subagent-timeline :deep(.nh-authorization__heading) {
  min-height: 32px;
}

.nh-subagent-timeline :deep(.nh-authorization__title) {
  font-size: 13px;
}

.nh-subagent-timeline :deep(.nh-authorization__warning) {
  margin-top: 6px;
  font-size: 11px;
}

.nh-subagent-timeline :deep(.nh-authorization__actions) {
  margin-top: 10px;
  padding-top: 10px;
}
</style>
