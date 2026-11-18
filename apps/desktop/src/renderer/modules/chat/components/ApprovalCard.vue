<template>
  <section class="nh-approval">
    <span class="nh-approval__icon">
      <AppIcon name="alert" :size="18" />
    </span>
    <div class="nh-approval__body">
      <p class="nh-approval__title">{{ t('chat.approvalTitle') }}</p>
      <p class="nh-approval__scope">{{ approval.scope }}</p>
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
 * 审批卡片：只对 pending 审批展示允许/拒绝操作。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChatApproval } from '../types';

defineProps<{ approval: ChatApproval }>();

const emit = defineEmits<{ approve: []; reject: [] }>();
</script>

<style scoped lang="less">
.nh-approval {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--nh-color-warning) 28%, var(--nh-color-border));
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-base);
  box-shadow: var(--nh-shadow-card);
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

.nh-approval__title,
.nh-approval__scope {
  margin: 0;
}

.nh-approval__title {
  font-size: 14px;
  font-weight: 500;
}

.nh-approval__scope {
  margin-top: 3px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.nh-approval__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
</style>
