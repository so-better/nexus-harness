<template>
  <div class="nh-provider-empty">
    <span class="nh-provider-empty__icon">
      <AppIcon name="spark" :size="24" />
    </span>
    <div class="nh-provider-empty__copy">
      <p class="nh-provider-empty__title">{{ t('settings.noProviders') }}</p>
      <p class="nh-provider-empty__hint">{{ t('settings.emptyHint') }}</p>
    </div>
    <NButton type="primary" secondary @click="emit('create')">
      <template #icon>
        <AppIcon name="plus" :size="14" />
      </template>
      {{ t('settings.newProvider') }}
    </NButton>
  </div>
</template>

<script setup lang="ts">
/**
 * 无 Provider 时的空状态与新增入口。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const emit = defineEmits<{ create: [] }>();
</script>

<style scoped lang="less">
.nh-provider-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 70%, transparent);
}

.nh-provider-empty__icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

.nh-provider-empty__copy {
  min-width: 0;
  flex: 1;
}

.nh-provider-empty__title,
.nh-provider-empty__hint {
  margin: 0;
}

.nh-provider-empty__title {
  color: var(--nh-color-text-primary);
  font-size: 14px;
}

.nh-provider-empty__hint {
  margin-top: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
