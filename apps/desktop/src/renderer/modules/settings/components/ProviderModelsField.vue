<template>
  <div class="nh-models-field">
    <div v-if="!rows.length" class="nh-models-field__empty">
      <span>{{ t('settings.modelsEmpty') }}</span>
      <NButton size="small" secondary :loading="testing" @click="emit('test')">
        <template #icon>
          <AppIcon name="refresh" :size="14" />
        </template>
        {{ t('settings.fetchModels') }}
      </NButton>
    </div>

    <template v-else>
      <div class="nh-models-field__header">
        <span class="nh-models-field__summary">
          {{ t('settings.selected') }} {{ models.length }} / {{ rows.length }}
        </span>
        <NButton size="small" secondary :loading="testing" @click="emit('test')">
          <template #icon>
            <AppIcon name="refresh" :size="14" />
          </template>
          {{ t('settings.refreshModels') }}
        </NButton>
      </div>

      <div class="nh-models-field__list">
        <div
          v-for="model in rows"
          :key="model.id"
          class="nh-model-row"
          :class="{ 'nh-model-row--selected': isSelected(model.id) }"
        >
          <div class="nh-model-row__main">
            <NCheckbox
              :checked="isSelected(model.id)"
              @update:checked="(checked: boolean) => toggleModel(model.id, checked)"
            />
            <span class="nh-model-row__name">{{ model.id }}</span>
            <NRadio
              v-if="isSelected(model.id)"
              class="nh-model-row__default"
              :checked="defaultModelId === model.id"
              @update:checked="
                (checked: boolean) => checked && emit('update:defaultModelId', model.id)
              "
            >
              {{ t('settings.defaultModel') }}
            </NRadio>
          </div>

          <div v-if="isSelected(model.id)" class="nh-model-row__config">
            <label class="nh-model-row__field">
              <span>{{ t('settings.modelContext') }}</span>
              <NInputNumber
                size="small"
                style="width: 100%"
                :value="model.contextWindow"
                :min="4096"
                :step="1024"
                @update:value="
                  (value: number | null) => updateModel(model.id, 'contextWindow', value)
                "
              />
            </label>
            <label class="nh-model-row__field">
              <span>{{ t('settings.modelOutput') }}</span>
              <NInputNumber
                size="small"
                style="width: 100%"
                :value="model.maxOutputTokens"
                :min="256"
                :step="256"
                @update:value="
                  (value: number | null) => updateModel(model.id, 'maxOutputTokens', value)
                "
              />
            </label>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 多模型配置：获取模型后以复选框列表选择，并配置预算与默认模型。
 */

import { computed } from 'vue';
import { NButton, NCheckbox, NInputNumber, NRadio } from 'naive-ui';
import type { ProviderModel } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  models: ProviderModel[];
  availableModels: string[];
  defaultModelId: string;
  testing: boolean;
}>();

const emit = defineEmits<{
  'update:models': [models: ProviderModel[]];
  'update:defaultModelId': [id: string];
  test: [];
}>();

/**
 * 已获取模型与已保存模型的合集，保持配置存在。
 */
const rows = computed<ProviderModel[]>(() => {
  const ids = [...new Set([...props.availableModels, ...props.models.map((model) => model.id)])];
  return ids.map(
    (id) =>
      props.models.find((model) => model.id === id) ?? {
        id,
        contextWindow: 128_000,
        maxOutputTokens: 4_096
      }
  );
});

const isSelected = (id: string): boolean => props.models.some((model) => model.id === id);

/**
 * 勾选模型时添加默认预算；取消时移除并修正默认模型。
 */
const toggleModel = (id: string, checked: boolean): void => {
  if (checked) {
    const model = rows.value.find((item) => item.id === id);
    if (!model) return;
    const next = [...props.models, model];
    emit('update:models', next);
    if (!props.defaultModelId) emit('update:defaultModelId', model.id);
    return;
  }

  const next = props.models.filter((model) => model.id !== id);
  emit('update:models', next);
  if (props.defaultModelId === id) emit('update:defaultModelId', next[0]?.id ?? '');
};

/**
 * 更新单个模型的上下文或输出预算。
 */
const updateModel = (
  id: string,
  key: 'contextWindow' | 'maxOutputTokens',
  value: number | null
): void => {
  if (value === null) return;
  emit(
    'update:models',
    props.models.map((model) => (model.id === id ? { ...model, [key]: value } : model))
  );
};
</script>

<style scoped lang="less">
.nh-models-field {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 10px;
}

.nh-models-field__empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: 10px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-models-field__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-models-field__summary {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-models-field__list {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  overflow: auto;
  border: 1px solid var(--nh-color-border);
  border-radius: 10px;
}

.nh-model-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--nh-color-border);
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-model-row:first-child {
  border-top: 0;
}

.nh-model-row--selected {
  background: color-mix(in srgb, var(--nh-color-accent) 5%, transparent);
}

.nh-model-row__main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-model-row__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-model-row__default {
  flex: none;
}

.nh-model-row__config {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  padding-left: 24px;
}

.nh-model-row__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
