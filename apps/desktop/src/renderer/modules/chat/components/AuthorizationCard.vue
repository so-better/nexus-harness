<template>
  <section class="nh-authorization">
    <span class="nh-authorization__icon">
      <AppIcon :name="icon" :size="18" />
    </span>
    <div class="nh-authorization__body">
      <div class="nh-authorization__heading">
        <p class="nh-authorization__title">{{ title }}</p>
        <slot name="title-extra" />
      </div>
      <slot />
      <p v-if="warning" class="nh-authorization__warning">{{ warning }}</p>
    </div>
    <div class="nh-authorization__actions">
      <NButton
        size="medium"
        secondary
        :disabled="Boolean(submitting)"
        :loading="submitting === 'reject'"
        @click="submit('reject')"
      >
        <template #icon><AppIcon name="close" :size="14" /></template>
        {{ t('chat.reject') }}
      </NButton>
      <NButton
        size="medium"
        type="primary"
        secondary
        :disabled="Boolean(submitting)"
        :loading="submitting === 'approve'"
        @click="submit('approve')"
      >
        <template #icon><AppIcon name="check" :size="14" /></template>
        {{ t('chat.approve') }}
      </NButton>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 授权/确认卡片：固定蓝色主调、浮动表面与底部操作区。
 */

import { onBeforeUnmount, ref } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon, { type AppIconName } from '@/components/AppIcon.vue';

defineProps<{
  title: string;
  icon: AppIconName;
  warning?: string;
}>();

const emit = defineEmits<{ approve: []; reject: [] }>();
const submitting = ref<'approve' | 'reject'>();
let resetTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 防止 IPC 往返期间重复提交；失败时短暂后恢复按钮。
 */
const submit = (action: 'approve' | 'reject'): void => {
  if (submitting.value) return;
  submitting.value = action;
  if (action === 'approve') emit('approve');
  else emit('reject');
  resetTimer = setTimeout(() => {
    submitting.value = undefined;
  }, 2_000);
};

onBeforeUnmount(() => {
  if (resetTimer) clearTimeout(resetTimer);
});
</script>

<style scoped lang="less">
.nh-authorization {
  display: grid;
  grid-template-areas:
    'icon body'
    'actions actions';
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 0 12px;
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: var(--nh-radius-lg);
  background: var(--nh-surface-base);
  box-shadow: var(--nh-shadow-float), var(--nh-highlight);
}

.nh-authorization__icon {
  display: grid;
  width: 40px;
  height: 40px;
  grid-area: icon;
  place-items: center;
  border-radius: 10px;
  background: var(--nh-color-accent);
  color: var(--nh-color-bg-base);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nh-color-accent) 22%, transparent);
}

.nh-authorization__body {
  min-width: 0;
  grid-area: body;
}

.nh-authorization__heading {
  display: flex;
  min-height: 40px;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.nh-authorization__title,
.nh-authorization__warning {
  margin: 0;
}

.nh-authorization__title {
  color: var(--nh-color-text-primary);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.nh-authorization__warning {
  margin-top: 9px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.nh-authorization__actions {
  display: flex;
  grid-area: actions;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
  justify-content: flex-end;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--nh-border-subtle);
}
</style>
