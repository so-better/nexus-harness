<template>
  <div class="nh-provider-list">
    <div class="nh-provider-list__header">
      <span> {{ providers.length }} {{ providerCountLabel }} </span>
      <NButton type="primary" secondary @click="emit('create')">
        <template #icon>
          <AppIcon name="plus" :size="14" />
        </template>
        {{ t('settings.newProvider') }}
      </NButton>
    </div>

    <div class="nh-provider-list__items">
      <div
        v-for="provider in providers"
        :key="provider.id"
        role="button"
        tabindex="0"
        class="nh-provider-item"
        :class="{ 'nh-provider-item--disabled': !provider.enabled }"
        @click="emit('edit', provider.id)"
        @keydown.enter.prevent="emit('edit', provider.id)"
        @keydown.space.prevent="emit('edit', provider.id)"
      >
        <span class="nh-provider-item__avatar">{{ initialOf(provider.name) }}</span>

        <span class="nh-provider-item__body">
          <span class="nh-provider-item__top">
            <span class="nh-provider-item__name">{{ provider.name }}</span>
            <span class="nh-provider-item__status">
              <span class="nh-provider-item__dot" />
              {{
                provider.enabled ? t('settings.providerEnabled') : t('settings.providerDisabled')
              }}
            </span>
          </span>
          <span class="nh-provider-item__url">
            {{ provider.protocol }} · {{ provider.baseUrl }}
          </span>
          <span class="nh-provider-item__meta">
            <span>
              {{ provider.models.length }} {{ modelCountLabel(provider.models.length) }}
            </span>
            <span v-if="provider.defaultModelId" class="nh-provider-item__default">
              <AppIcon name="check" :size="12" />
              <span>{{ t('settings.defaultModel') }}</span>
              <span class="nh-provider-item__model">{{ provider.defaultModelId }}</span>
            </span>
          </span>
        </span>

        <span class="nh-provider-item__actions" @click.stop @keydown.stop>
          <NSwitch
            size="small"
            :value="provider.enabled"
            :loading="busyId === provider.id"
            :aria-label="t('settings.enabled')"
            @update:value="(value: boolean) => emit('toggle', provider.id, value)"
          />
          <NButton text type="primary" @click="emit('edit', provider.id)">
            <template #icon>
              <AppIcon name="edit" :size="14" />
            </template>
            {{ t('settings.edit') }}
          </NButton>
          <NPopconfirm @positive-click="emit('delete', provider.id)">
            <template #trigger>
              <NButton text type="error" :aria-label="t('settings.deleteProvider')">
                <template #icon>
                  <AppIcon name="trash" :size="14" />
                </template>
                {{ t('settings.delete') }}
              </NButton>
            </template>
            {{ t('settings.deleteProvider') }}?
          </NPopconfirm>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Provider 列表：点击进入编辑，保存后返回这里。
 */

import { computed } from 'vue';
import { NButton, NPopconfirm, NSwitch } from 'naive-ui';
import type { ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{ providers: ProviderPublic[]; busyId: string }>();

const emit = defineEmits<{
  create: [];
  edit: [id: string];
  toggle: [id: string, enabled: boolean];
  delete: [id: string];
}>();

const providerCountLabel = computed(() =>
  props.providers.length === 1 ? t('settings.providerCountOne') : t('settings.providerCountMany')
);

/**
 * 模型数量文案按语言处理单复数。
 */
const modelCountLabel = (count: number): string =>
  count === 1 ? t('settings.modelCountOne') : t('settings.modelCountMany');

/**
 * 取供应商名称首字符作为轻量标识，不伪造品牌 Logo。
 */
const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || 'N';
</script>

<style scoped lang="less">
.nh-provider-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nh-provider-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-provider-list__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-provider-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-color-bg-base);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-provider-item:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 50%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 3%, var(--nh-color-bg-base));
}

.nh-provider-item__avatar {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-accent) 9%, transparent);
  color: var(--nh-color-accent);
  font-size: 14px;
  font-weight: 600;
}

.nh-provider-item--disabled .nh-provider-item__avatar {
  background: var(--nh-surface-hover);
  color: var(--nh-color-text-secondary);
}

.nh-provider-item__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.nh-provider-item__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-provider-item__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-provider-item__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-provider-item__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nh-color-success);
}

.nh-provider-item--disabled .nh-provider-item__dot {
  background: var(--nh-color-text-disabled);
}

.nh-provider-item__url {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-provider-item__meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-provider-item__default {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  color: var(--nh-color-text-secondary);
}

.nh-provider-item__default :deep(.nh-icon) {
  color: var(--nh-color-accent);
}

.nh-provider-item__model {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-provider-item__actions {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.nh-provider-item__actions :deep(.n-button) {
  font-size: 12px;
}
</style>
