<template>
  <section class="nh-image-settings">
    <ImageConfigForm
      v-if="editing"
      :config="editingConfig"
      :saving="saving"
      @cancel="closeEditor"
      @save="saveConfig"
    />

    <template v-else>
      <div class="nh-image-settings__toolbar">
        <span class="nh-image-settings__count">
          {{ configs.length }}
          {{ configs.length === 1 ? t('settings.modelCountOne') : t('settings.modelCountMany') }}
        </span>
        <NButton type="primary" secondary @click="startNew">
          <template #icon>
            <AppIcon name="plus" :size="14" />
          </template>
          {{ t('settings.imageAdd') }}
        </NButton>
      </div>

      <div v-if="configs.length === 0" class="nh-image-settings__empty">
        {{ t('settings.imageEmpty') }}
      </div>

      <div v-else class="nh-image-settings__list">
        <div
          v-for="config in configs"
          :key="config.id"
          role="button"
          tabindex="0"
          class="nh-image-card"
          :class="{ 'nh-image-card--disabled': !config.enabled }"
          @click="startEdit(config)"
          @keydown.enter.prevent="startEdit(config)"
          @keydown.space.prevent="startEdit(config)"
        >
          <span class="nh-image-card__avatar">{{ initialOf(config.name) }}</span>

          <span class="nh-image-card__body">
            <span class="nh-image-card__top">
              <span class="nh-image-card__name">{{ config.name }}</span>
              <span class="nh-image-card__status">
                <span class="nh-image-card__dot" />
                {{
                  config.enabled ? t('settings.imageEnabledTag') : t('settings.imageDisabledTag')
                }}
              </span>
            </span>
            <span class="nh-image-card__model">{{ config.model }}</span>
            <span class="nh-image-card__url">{{ config.template.url }}</span>
          </span>

          <span class="nh-image-card__actions" @click.stop @keydown.stop>
            <NSwitch
              size="small"
              :value="config.enabled"
              :loading="busyId === config.id"
              :aria-label="t('settings.imageEnabled')"
              @update:value="(value: boolean) => toggle(config, value)"
            />
            <NButton text type="primary" @click="startEdit(config)">
              <template #icon>
                <AppIcon name="edit" :size="14" />
              </template>
              {{ t('settings.edit') }}
            </NButton>
            <NPopconfirm @positive-click="remove(config.id)">
              <template #trigger>
                <NButton text type="error" :aria-label="t('settings.imageDelete')">
                  <template #icon>
                    <AppIcon name="trash" :size="14" />
                  </template>
                  {{ t('settings.delete') }}
                </NButton>
              </template>
              {{ t('settings.imageDeleteConfirm') }}
            </NPopconfirm>
          </span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * 独立图像模型设置：生图配置列表与模板编辑器。
 */

import { onMounted, ref } from 'vue';
import { NButton, NPopconfirm, NSwitch, useMessage } from 'naive-ui';
import type { ImageConfig } from '@shared/image';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { getImageSettings, setImageSettings } from '../api/settings.api';
import ImageConfigForm from '../components/ImageConfigForm.vue';

const message = useMessage();
const configs = ref<ImageConfig[]>([]);
const editing = ref(false);
const editingConfig = ref<ImageConfig | null>(null);
const saving = ref(false);
const busyId = ref('');

const load = async (): Promise<void> => {
  try {
    const value = await getImageSettings();
    configs.value = value?.configs ?? [];
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.imageLoadFailed'));
  }
};

const persist = async (next: ImageConfig[]): Promise<void> => {
  const result = await setImageSettings({ configs: next });
  configs.value = result.configs;
};

const startNew = (): void => {
  editingConfig.value = null;
  editing.value = true;
};

const startEdit = (config: ImageConfig): void => {
  editingConfig.value = config;
  editing.value = true;
};

const closeEditor = (): void => {
  editing.value = false;
  editingConfig.value = null;
};

const saveConfig = async (config: ImageConfig): Promise<void> => {
  saving.value = true;
  try {
    const next = editingConfig.value
      ? configs.value.map((item) => (item.id === config.id ? config : item))
      : [...configs.value, config];
    await persist(next);
    message.success(t('settings.imageSaved'));
    closeEditor();
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.imageSaveFailed'));
  } finally {
    saving.value = false;
  }
};

const toggle = async (config: ImageConfig, enabled: boolean): Promise<void> => {
  busyId.value = config.id;
  try {
    await persist(
      configs.value.map((item) => (item.id === config.id ? { ...item, enabled } : item))
    );
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.imageSaveFailed'));
  } finally {
    busyId.value = '';
  }
};

const remove = async (id: string): Promise<void> => {
  busyId.value = id;
  try {
    await persist(configs.value.filter((item) => item.id !== id));
    message.success(t('settings.deleted'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.imageSaveFailed'));
  } finally {
    busyId.value = '';
  }
};

const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || 'N';

onMounted(load);
</script>

<style scoped lang="less">
.nh-image-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nh-image-settings__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-image-settings__count {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-image-settings__empty {
  padding: 32px 16px;
  border: 1px dashed var(--nh-border-subtle);
  border-radius: 10px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.nh-image-settings__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-image-card {
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

.nh-image-card:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 50%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 3%, var(--nh-color-bg-base));
}

.nh-image-card__avatar {
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

.nh-image-card--disabled .nh-image-card__avatar {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-image-card__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.nh-image-card__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-image-card__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-image-card__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-image-card__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nh-color-success);
}

.nh-image-card--disabled .nh-image-card__dot {
  background: var(--nh-color-text-disabled);
}

.nh-image-card__model,
.nh-image-card__url {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-image-card__model {
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
}

.nh-image-card__actions {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.nh-image-card__actions :deep(.n-button) {
  font-size: 12px;
}
</style>
