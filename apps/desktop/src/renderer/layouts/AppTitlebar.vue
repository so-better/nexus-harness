<template>
  <header class="nh-titlebar">
    <div class="nh-titlebar__left">
      <button type="button" class="nh-titlebar__button" @click="emit('choose-root')">
        {{ rootLabel }}
      </button>
    </div>
    <label class="nh-titlebar__provider">
      <span>{{ t('app.provider') }}</span>
      <select :value="providerId" @change="onChange">
        <option v-if="providers.length === 0" value="">{{ t('app.noProvider') }}</option>
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">
          {{ provider.name }} · {{ provider.model }}
        </option>
      </select>
    </label>
  </header>
</template>

<script setup lang="ts">
/**
 * 标题栏：临时目录选择与模型切换。
 */

import type { ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

defineProps<{
  rootLabel: string;
  providerId?: string | undefined;
  providers: ProviderPublic[];
}>();

const emit = defineEmits<{ 'choose-root': []; 'update-provider': [id: string] }>();

/**
 * 把原生 select 变化转为 provider id。
 */
const onChange = (event: Event): void => {
  const value = (event.target as HTMLSelectElement).value;
  if (value) emit('update-provider', value);
};
</script>

<style scoped lang="less">
.nh-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nh-space-md);
  padding: 0 12px;
  border-bottom: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
}

.nh-titlebar__left,
.nh-titlebar__provider {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-titlebar__button {
  padding: 6px 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-sm);
  background: transparent;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-titlebar__provider {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-titlebar__provider select {
  padding: 4px 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-sm);
  background: var(--nh-color-bg-base);
}
</style>
