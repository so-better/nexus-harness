<template>
  <section class="nh-approval">
    <div class="nh-approval__body">
      <p class="nh-approval__title">{{ t('chat.approvalTitle') }}</p>
      <p class="nh-approval__scope">{{ t('chat.approvalScope') }}: {{ approval.scope }}</p>
    </div>
    <div class="nh-approval__actions">
      <button type="button" class="nh-approval__button" @click="emit('reject')">
        {{ t('chat.reject') }}
      </button>
      <button
        type="button"
        class="nh-approval__button nh-approval__button--primary"
        @click="emit('approve')"
      >
        {{ t('chat.approve') }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 审批卡片：只对 pending 审批展示允许/拒绝操作。
 */

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
  gap: var(--nh-space-md);
  padding: 12px;
  border: 1px solid var(--nh-color-warning);
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-elevated);
}

.nh-approval__body {
  min-width: 0;
}

.nh-approval__title,
.nh-approval__scope {
  margin: 0;
}

.nh-approval__title {
  font-weight: 600;
}

.nh-approval__scope {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-approval__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

.nh-approval__button {
  padding: 6px 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-sm);
  background: transparent;
}

.nh-approval__button--primary {
  border-color: var(--nh-color-accent);
  color: var(--nh-color-accent);
}
</style>
