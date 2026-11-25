<template>
  <div class="nh-composer__actions">
    <div class="nh-composer__hint-row">
      <NText v-if="disabledReason" depth="3" class="nh-composer__hint">
        {{ disabledReason }}
      </NText>
      <span v-else class="nh-composer__keys">
        {{ t(canReference ? 'chat.composerHint' : 'chat.composerHintNoFiles') }}
      </span>
    </div>
    <div class="nh-composer__send-group">
      <ApprovalPolicySelect
        :approval-policy="approvalPolicy"
        :disabled="running"
        :has-workspace="hasWorkspace"
        @update-approval-policy="emit('update-approval-policy', $event)"
      />
      <AgentModeSelect
        :mode="mode"
        :disabled="running"
        @update-mode="emit('update-mode', $event)"
      />
      <NButton
        type="primary"
        secondary
        attr-type="button"
        :disabled="!canAttach"
        :title="t('chat.attachmentAdd')"
        @click="emit('attach')"
      >
        <template #icon><AppIcon name="upload" :size="14" /></template>
        {{ t('chat.attachmentAdd') }}
      </NButton>
      <NButton v-if="running" type="error" @click="emit('stop')">
        <template #icon>
          <AppIcon name="stop" />
        </template>
        {{ t('app.stop') }}
      </NButton>
      <NButton v-else type="primary" :disabled="disabled || !canSend" attr-type="submit">
        <template #icon>
          <AppIcon name="send" />
        </template>
        {{ t('app.send') }}
      </NButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 输入区底部状态与操作。
 */

import { NButton, NText } from 'naive-ui';
import type { AgentMode, ApprovalPolicy } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import AgentModeSelect from './AgentModeSelect.vue';
import ApprovalPolicySelect from './ApprovalPolicySelect.vue';

defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  mode: AgentMode;
  approvalPolicy: ApprovalPolicy;
  hasWorkspace: boolean;
  canSend: boolean;
  canReference: boolean;
  canAttach: boolean;
}>();

const emit = defineEmits<{
  stop: [];
  attach: [];
  'update-mode': [mode: AgentMode];
  'update-approval-policy': [policy: ApprovalPolicy];
}>();
</script>

<style scoped lang="less">
.nh-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.nh-composer__send-group {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.nh-composer__hint-row {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
}

.nh-composer__hint {
  font-size: 12px;
}

.nh-composer__keys {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}
</style>
