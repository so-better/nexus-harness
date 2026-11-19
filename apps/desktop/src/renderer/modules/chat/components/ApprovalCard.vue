<template>
  <section class="nh-approval" :class="{ 'nh-approval--inline': inline }">
    <span v-if="!inline" class="nh-approval__icon">
      <AppIcon name="alert" :size="18" />
    </span>
    <div class="nh-approval__body">
      <template v-if="!inline">
        <div class="nh-approval__heading">
          <p class="nh-approval__title">{{ t('chat.approvalTitle') }}</p>
          <code v-if="tool" class="nh-approval__tool">{{ tool.name }}</code>
        </div>
        <p v-if="!tool || approval.scope !== tool.name" class="nh-approval__scope">
          {{ approval.scope }}
        </p>
      </template>

      <ApprovalDetails v-if="tool" :tool="tool" />
      <PluginSlot
        location="approval.details"
        :context="{
          location: 'approval.details',
          sessionId,
          messageId,
          runId,
          approvalId: approval.id,
          toolCallId: approval.toolCallId
        }"
      />

      <p class="nh-approval__warning">{{ t('chat.approvalWarning') }}</p>
    </div>
    <div class="nh-approval__actions">
      <NButton size="small" secondary @click="emit('reject')">
        <template #icon>
          <AppIcon name="close" :size="14" />
        </template>
        {{ t('chat.reject') }}
      </NButton>
      <NButton size="small" type="primary" @click="emit('approve')">
        <template #icon>
          <AppIcon name="check" :size="14" />
        </template>
        {{ t('chat.approve') }}
      </NButton>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 审批卡片：展示将要执行的路径、命令、内容或补丁，再允许/拒绝。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import ApprovalDetails from './ApprovalDetails.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import type { ChatApproval, ChatToolCall } from '../types';

defineProps<{
  approval: ChatApproval;
  tool?: ChatToolCall | undefined;
  inline?: boolean;
  sessionId?: string | undefined;
  messageId?: string | undefined;
  runId?: string | undefined;
}>();

const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<style scoped lang="less">
.nh-approval {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-warning) 28%, var(--nh-color-border));
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-base);
  box-shadow: var(--nh-shadow-card);
}

.nh-approval--inline {
  padding: 10px;
  border-radius: 8px;
  box-shadow: none;
}

.nh-approval__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-warning) 12%, transparent);
  color: var(--nh-color-warning);
}

.nh-approval__body {
  min-width: 0;
  flex: 1;
}

.nh-approval__heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-approval__title,
.nh-approval__scope,
.nh-approval__warning {
  margin: 0;
}

.nh-approval__title {
  font-size: 14px;
  font-weight: 500;
}

.nh-approval__tool,
.nh-approval__value {
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
}

.nh-approval__scope {
  margin-top: 3px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.nh-approval__warning {
  margin-top: 9px;
  color: var(--nh-color-warning);
  font-size: 11px;
}

.nh-approval__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
</style>
