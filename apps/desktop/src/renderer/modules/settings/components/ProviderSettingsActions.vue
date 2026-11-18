<template>
  <div class="nh-provider-actions">
    <NButton tertiary @click="emit('back')">
      <template #icon>
        <AppIcon name="chevron-left" :size="14" />
      </template>
      {{ t('settings.backToList') }}
    </NButton>
    <NPopconfirm v-if="selected" @positive-click="emit('delete')">
      <template #trigger>
        <NButton tertiary type="error">
          <template #icon>
            <AppIcon name="trash" :size="14" />
          </template>
          {{ t('settings.deleteProvider') }}
        </NButton>
      </template>
      {{ t('settings.deleteProvider') }}?
    </NPopconfirm>
    <NButton type="primary" :loading="saving" @click="emit('save')">
      <template #icon>
        <AppIcon name="check" :size="14" />
      </template>
      {{ t('settings.save') }}
    </NButton>
  </div>
</template>

<script setup lang="ts">
/**
 * Provider 表单底部操作：返回列表、删除与保存。
 */

import { NButton, NPopconfirm } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ selected: boolean; saving: boolean }>();

const emit = defineEmits<{ back: []; save: []; delete: [] }>();
</script>

<style scoped lang="less">
.nh-provider-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--nh-color-border);
}
</style>
