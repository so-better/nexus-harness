<template>
  <footer class="nh-ask-user__footer">
    <span v-if="showError" class="nh-ask-user__error">{{ t('chat.askUserRequired') }}</span>
    <div class="nh-ask-user__actions">
      <NButton size="small" secondary @click="emit('cancel')">
        {{ t('chat.askUserCancel') }}
      </NButton>
      <NButton size="small" type="primary" secondary @click="emit('submit')">
        {{ t('chat.askUserSubmit') }}
      </NButton>
    </div>
  </footer>
</template>

<script setup lang="ts">
/**
 * Ask User 卡片底部操作区。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';

defineProps<{ showError: boolean }>();

const emit = defineEmits<{ cancel: []; submit: [] }>();
</script>

<style scoped lang="less">
.nh-ask-user__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-ask-user__error {
  color: var(--nh-color-danger);
  font-size: 12px;
}

.nh-ask-user__actions {
  display: flex;
  flex: none;
  gap: 8px;
  margin-left: auto;
}
</style>
