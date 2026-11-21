<template>
  <AuthorizationCard
    :title="title"
    icon="alert"
    :warning="t('chat.approvalWarning')"
    @approve="emit('approve')"
    @reject="emit('reject')"
  >
    <p v-if="!tool || approval.scope !== tool.name" class="nh-approval-scope">
      {{ approval.scope }}
    </p>
    <ApprovalDetails v-if="tool" :tool="tool" />
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
 * 审批标题直接说明将要发生什么，避免所有工具都只显示泛化的“需要审批”。
 */
const title = computed(() => {
  const name = props.tool?.name;
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
</style>
