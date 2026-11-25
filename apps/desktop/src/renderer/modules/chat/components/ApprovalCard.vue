<template>
  <AuthorizationCard
    :title="title"
    icon="alert"
    :warning="t('chat.approvalWarning')"
    @approve="emit('approve')"
    @reject="emit('reject')"
  >
    <template v-if="$slots['footer-left']" #footer-left>
      <slot name="footer-left" />
    </template>
    <p v-if="!detailTool || approval.scope !== detailTool.name" class="nh-approval-scope">
      {{ approval.scope }}
    </p>
    <div class="nh-approval-summary">
      <div class="nh-approval-summary__main">
        <span class="nh-approval-summary__label">{{ summary.label }}</span>
        <code class="nh-approval-summary__value">{{ summary.value }}</code>
      </div>
      <p v-if="summary.meta" class="nh-approval-summary__meta">{{ summary.meta }}</p>
    </div>
    <ApprovalDetails v-if="detailTool" :tool="detailTool" />
  </AuthorizationCard>
</template>

<script setup lang="ts">
/**
 * 工具审批卡：复用通用授权卡并补充工具详情。
 */

import { computed } from 'vue';
import { t } from '@/app/i18n';
import type { ChatApproval, ChatToolCall } from '../types';
import ApprovalDetails from './ApprovalDetails.vue';
import AuthorizationCard from './AuthorizationCard.vue';

const props = defineProps<{
  approval: ChatApproval;
  tool?: ChatToolCall | undefined;
  sessionId?: string | undefined;
  messageId?: string | undefined;
  runId?: string | undefined;
}>();

const emit = defineEmits<{ approve: []; reject: [] }>();

/**
 * 子代理审批会带上实际待批准的工具；优先用它展示 diff/命令，而不是外层 task 工具。
 */
const detailTool = computed<ChatToolCall | undefined>(() => {
  if (!props.approval.toolName) return props.tool;
  return {
    id: props.approval.toolCallId,
    name: props.approval.toolName,
    input: props.approval.input,
    status: 'waiting_approval'
  };
});

const input = computed<Record<string, unknown>>(() =>
  detailTool.value?.input && typeof detailTool.value.input === 'object'
    ? (detailTool.value.input as Record<string, unknown>)
    : {}
);
const stringValue = (key: string): string | undefined =>
  typeof input.value[key] === 'string' ? (input.value[key] as string) : undefined;
/**
 * 按 Unicode 码点统计字符数，避免 emoji 被 String.length 算成两个字符。
 */
const countChars = (value: string | undefined): number => [...(value ?? '')].length;

/**
 * 审批摘要：让用户无需展开工具卡就能知道将要执行什么。
 */
const summary = computed<{ label: string; value: string; meta?: string }>(() => {
  const name = detailTool.value?.name;
  const command = stringValue('command');
  const path = stringValue('path');
  const query = stringValue('query');
  const prompt = stringValue('prompt');
  const cwd = stringValue('cwd');
  if (name === 'run_command' && command) {
    return {
      label: t('chat.approvalSummaryCommand'),
      value: command,
      ...(cwd ? { meta: `${t('chat.approvalCwd')}: ${cwd}` } : {})
    };
  }
  if ((name === 'write_file' || name === 'apply_patch') && path) {
    const oldText = stringValue('oldText');
    const newText = stringValue('newText');
    return {
      label: t('chat.approvalSummaryWrite'),
      value: path,
      ...(oldText !== undefined || newText !== undefined
        ? {
            meta: `${t('chat.approvalDiffAdded')} ${countChars(newText)} ${t('chat.approvalDiffChars')} / ${t('chat.approvalDiffRemoved')} ${countChars(oldText)} ${t('chat.approvalDiffChars')}`
          }
        : {})
    };
  }
  if (name?.startsWith('mcp_')) {
    const args = JSON.stringify(detailTool.value?.input ?? {}).slice(0, 180);
    return {
      label: t('chat.approvalSummaryMcp'),
      value: name,
      ...(args && args !== '{}' ? { meta: args } : {})
    };
  }
  if (name === 'generate_image' && prompt) {
    return { label: t('chat.approvalSummaryImage'), value: prompt };
  }
  if ((name === 'search_images' || name === 'search_videos') && query) {
    return { label: t('chat.approvalSummarySearch'), value: query };
  }
  if (name === 'web_search' && query) {
    return { label: t('chat.approvalSummaryWebSearch'), value: query };
  }
  const url = stringValue('url');
  if (name === 'web_fetch' && url) {
    return { label: t('chat.approvalSummaryWebFetch'), value: url };
  }
  return { label: t('chat.approvalSummaryTool'), value: name ?? props.approval.scope };
});

/**
 * 审批标题直接说明将要发生什么，避免所有工具都只显示泛化的“需要审批”。
 */
const title = computed(() => {
  const name = detailTool.value?.name;
  if (name === 'run_command') return t('chat.approvalCommandTitle');
  if (name === 'write_file' || name === 'apply_patch') return t('chat.approvalWriteTitle');
  if (name === 'generate_image') return t('chat.approvalImageTitle');
  if (name === 'search_images' || name === 'search_videos') return t('chat.approvalSearchTitle');
  if (name?.startsWith('mcp_')) return t('chat.approvalMcpTitle');
  if (name === 'run_skill_script') return t('chat.approvalSkillScriptTitle');
  if (name === 'terminal_request_access') return t('chat.approvalTerminalAccessTitle');
  return t('chat.approvalTitle');
});
</script>

<style scoped lang="less">
.nh-approval-scope {
  margin: 6px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-approval-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  margin-top: 9px;
  padding: 8px 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: var(--nh-surface-elevated);
}

.nh-approval-summary__main {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.nh-approval-summary__label {
  flex: none;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-approval-summary__value {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-approval-summary__meta {
  max-height: 3.2em;
  overflow: auto;
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
</style>
