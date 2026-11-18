<template>
  <section class="nh-approval">
    <div class="nh-approval__body">
      <div class="nh-approval__title-row">
        <NTag size="small" type="warning" :bordered="false">{{ t('chat.approvalTitle') }}</NTag>
        <NTag size="small" :bordered="false">{{ approval.scope }}</NTag>
      </div>
      <p class="nh-approval__scope">{{ t('chat.approvalScope') }}: {{ approval.scope }}</p>
    </div>
    <div class="nh-approval__actions">
      <NButton size="small" @click="emit('reject')">{{ t('chat.reject') }}</NButton>
      <NButton size="small" type="primary" @click="emit('approve')">
        {{ t('chat.approve') }}
      </NButton>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 审批卡片：只对 pending 审批展示允许/拒绝操作。
 */

import { NButton, NTag } from 'naive-ui';
import { t } from '@/app/i18n';
import type { ChatApproval } from '../types';

defineProps<{ approval: ChatApproval }>();

const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<style scoped lang="less">
.nh-approval {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-warning) 32%, var(--nh-color-border));
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-elevated);
  background: color-mix(in srgb, var(--nh-color-warning) 7%, var(--nh-color-bg-base));
  box-shadow: var(--nh-highlight);
}

.nh-approval__body {
  min-width: 0;
}

.nh-approval__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-approval__scope {
  margin: 6px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-approval__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
</style>
