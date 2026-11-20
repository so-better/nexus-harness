<template>
  <div class="nh-composer__selectors">
    <NButton
      v-if="providers.length === 0"
      type="primary"
      secondary
      round
      size="small"
      @click="emit('open-settings')"
    >
      <template #icon><AppIcon name="settings" :size="14" /></template>
      {{ t('chat.configureModel') }}
    </NButton>
    <template v-else>
      <NDropdown
        trigger="click"
        placement="bottom-start"
        :options="providerOptions"
        @select="onProviderChange"
      >
        <button
          type="button"
          class="nh-composer__selector"
          aria-haspopup="menu"
          :title="providerLabel"
          :aria-label="providerLabel"
        >
          <span class="nh-composer__selector-label">{{ providerLabel }}</span>
          <AppIcon name="chevron-down" :size="12" />
        </button>
      </NDropdown>
      <NDropdown
        trigger="click"
        placement="bottom-start"
        :options="modelOptions"
        @select="onModelChange"
      >
        <NButton text size="small" class="nh-composer__selector" :disabled="models.length === 0">
          <span class="nh-composer__selector-label">{{ modelLabel }}</span>
          <AppIcon name="chevron-down" :size="12" />
        </NButton>
      </NDropdown>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话模型与提供商选择器。
 */

import { computed } from 'vue';
import { NButton, NDropdown, type DropdownOption } from 'naive-ui';
import type { ProviderModel, ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  providers: ProviderPublic[];
  models: ProviderModel[];
  providerId?: string | undefined;
  modelId?: string | undefined;
}>();
const emit = defineEmits<{
  'update-provider': [id: string];
  'update-model': [id: string];
  'open-settings': [];
}>();

const providerLabel = computed(
  () =>
    props.providers.find((provider) => provider.id === props.providerId)?.name ??
    t('app.noProvider')
);
const modelLabel = computed(
  () => props.models.find((model) => model.id === props.modelId)?.id ?? t('chat.needsModel')
);
const providerOptions = computed<DropdownOption[]>(() =>
  props.providers.map((provider) => ({
    key: provider.id,
    label: provider.name,
    disabled: !provider.enabled
  }))
);
const modelOptions = computed<DropdownOption[]>(() =>
  props.models.map((model) => ({ key: model.id, label: model.id }))
);

const onProviderChange = (key: string | number): void => {
  if (typeof key === 'string' && key) emit('update-provider', key);
};
const onModelChange = (key: string | number): void => {
  if (typeof key === 'string' && key) emit('update-model', key);
};
</script>

<style scoped lang="less">
.nh-composer__selectors {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.nh-composer__selector {
  display: inline-flex;
  overflow: hidden;
  max-width: 220px;
  height: 32px;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-composer__selector:disabled {
  cursor: default;
  opacity: 0.55;
}

.nh-composer__selector:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: 1px;
}

.nh-composer__selector:hover:not(:disabled) {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
}

.nh-composer__selector-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
