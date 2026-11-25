<template>
  <div class="nh-continue-bar">
    <span class="nh-continue-bar__hint">{{ t('chat.maxStepsContinueHint') }}</span>
    <NButton type="primary" size="small" @click="emit('resume')">
      <template #icon><AppIcon name="play" :size="14" /></template>
      {{ t('chat.continue') }}
    </NButton>
  </div>
</template>

<script setup lang="ts">
/**
 * 步数上限后的“继续”条：点击后由上层发送一条“继续”用户消息续跑。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const emit = defineEmits<{ resume: [] }>();
</script>

<style scoped lang="less">
.nh-continue-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-color-bg-elevated);
}

.nh-continue-bar__hint {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
