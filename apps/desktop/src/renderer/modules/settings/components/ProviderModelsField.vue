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
        <div class="nh-models-field__header-main">
          <NCheckbox
            :checked="allSelected"
            :indeterminate="someSelected"
            @update:checked="toggleAll"
          >
            {{ t('settings.selectAll') }}
          </NCheckbox>
          <span class="nh-models-field__summary">
            {{ t('settings.selected') }} {{ models.length }} / {{ rows.length }}
          </span>
        </div>
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
            <div class="nh-model-row__row nh-model-row__row--budget">
              <label class="nh-model-row__field">
                <span>{{ t('settings.modelContext') }}</span>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :value="model.contextWindow"
                  :min="4096"
                  :step="1024"
                  v-bind="budgetInvalid(model) ? { status: 'error' } : {}"
                  @update:value="
                    (value: number | null) => updateModel(model.id, 'contextWindow', value)
                  "
                >
                  <template #suffix>
                    <span class="nh-model-row__unit">{{ t('settings.modelTokensUnit') }}</span>
                  </template>
                </NInputNumber>
              </label>
              <label class="nh-model-row__field">
                <span>{{ t('settings.modelOutput') }}</span>
                <NInputNumber
                  size="small"
                  style="width: 100%"
                  :value="model.maxOutputTokens"
                  :min="256"
                  :step="256"
                  v-bind="budgetInvalid(model) ? { status: 'error' } : {}"
                  @update:value="
                    (value: number | null) => updateModel(model.id, 'maxOutputTokens', value)
                  "
                >
                  <template #suffix>
                    <span class="nh-model-row__unit">{{ t('settings.modelTokensUnit') }}</span>
                  </template>
                </NInputNumber>
              </label>
              <small v-if="budgetInvalid(model)" class="nh-model-row__error">
                {{ t('settings.modelBudgetInvalid') }}
              </small>
            </div>

            <div class="nh-model-row__row nh-model-row__row--reasoning">
              <label class="nh-model-row__field">
                <span>{{ t('settings.modelReasoningPassback') }}</span>
                <span class="nh-model-row__switch">
                  <NSwitch
                    size="small"
                    :value="model.reasoningPassback === true"
                    @update:value="
                      (value: boolean) => updateModel(model.id, 'reasoningPassback', value)
                    "
                  />
                </span>
              </label>
              <label v-if="protocol !== 'anthropic'" class="nh-model-row__field">
                <span>{{ t('settings.modelReasoningField') }}</span>
                <NInput
                  size="small"
                  :value="model.reasoningField ?? ''"
                  placeholder="reasoning_content"
                  v-bind="reasoningFieldInvalid(model) ? { status: 'error' } : {}"
                  @update:value="(value: string) => updateModel(model.id, 'reasoningField', value)"
                />
                <small v-if="reasoningFieldInvalid(model)" class="nh-model-row__error">
                  {{ t('settings.modelReasoningFieldInvalid') }}
                </small>
              </label>
              <small v-else class="nh-model-row__hint">
                {{ t('settings.modelReasoningAnthropicHint') }}
              </small>
            </div>

            <label class="nh-model-row__field nh-model-row__field--extra">
              <span class="nh-model-row__label-row">
                <span>{{ t('settings.modelExtraParams') }}</span>
                <small class="nh-model-row__hint">
                  {{ t('settings.modelExtraParamsHint') }}
                </small>
              </span>
              <div class="nh-model-row__extra-body">
                <NInput
                  :value="extraText(model)"
                  type="textarea"
                  size="small"
                  :autosize="{ minRows: 4, maxRows: 12 }"
                  :placeholder="t('settings.extraParamsPlaceholder')"
                  v-bind="extraErrors[model.id] ? { status: 'error' } : {}"
                  @update:value="(value: string) => updateExtraDraft(model, value)"
                  @blur="resetExtraDraft(model)"
                />
                <small v-if="extraErrors[model.id]" class="nh-model-row__error">
                  {{ extraErrors[model.id] }}
                </small>
              </div>
            </label>
          </div>
        </div>
      </div>
    </template>

    <div class="nh-models-field__fallback">
      <NButton
        text
        size="small"
        class="nh-models-field__fallback-toggle"
        :aria-expanded="showManual"
        @click="showManual = !showManual"
      >
        <span>{{ showManual ? t('settings.manualAddHide') : t('settings.manualAddToggle') }}</span>
        <AppIcon
          class="nh-models-field__fallback-chevron"
          :name="showManual ? 'chevron-up' : 'chevron-down'"
          :size="14"
        />
      </NButton>

      <Transition name="nh-manual">
        <NFormItem
          v-if="showManual"
          class="nh-models-field__manual-item"
          :show-label="false"
          :validation-status="manualError ? 'error' : 'success'"
          :show-feedback="Boolean(manualError)"
          :feedback="manualError"
        >
          <div class="nh-models-field__manual">
            <NInput
              v-model:value="manualModelId"
              size="small"
              :placeholder="t('settings.pleaseInput')"
              @keydown.enter.prevent="addManualModel"
            />
            <NButton size="small" secondary @click="addManualModel">
              {{ t('settings.addModel') }}
            </NButton>
          </div>
        </NFormItem>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 多模型配置：上下文窗口、输出上限与 reasoning 回传作为结构化字段；
 * 额外请求参数用单个 JSON 原样透传给模型，宿主不解析其中字段。
 */

import { computed, reactive, ref, watch } from 'vue';
import { NButton, NCheckbox, NFormItem, NInput, NInputNumber, NRadio, NSwitch } from 'naive-ui';
import type { ProviderModel } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import {
  findReservedProviderParams,
  findSensitiveProviderParams,
  isValidReasoningField
} from '@shared/provider-params';
import { parseExtraParams } from '../validation/extra-params';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  models: ProviderModel[];
  availableModels: string[];
  defaultModelId: string;
  testing: boolean;
  protocol: 'openai' | 'anthropic' | 'ollama';
}>();

const emit = defineEmits<{
  'update:models': [models: ProviderModel[]];
  'update:defaultModelId': [id: string];
  'update:valid': [valid: boolean];
  test: [];
}>();

/**
 * 新建模型的默认上下文窗口与输出预算（不同网关自行调整）。
 */
const DEFAULT_CONTEXT_WINDOW = 1_000_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;

/**
 * 已获取模型与已保存模型的合集，保持配置存在。
 */
const rows = computed<ProviderModel[]>(() => {
  const ids = [...new Set([...props.availableModels, ...props.models.map((model) => model.id)])];
  return ids.map(
    (id) =>
      props.models.find((model) => model.id === id) ?? {
        id,
        contextWindow: DEFAULT_CONTEXT_WINDOW,
        maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
      }
  );
});

const extraDrafts = reactive<Record<string, string>>({});
const extraErrors = reactive<Record<string, string>>({});

/**
 * 输出上限必须小于上下文窗口；不满足时禁用保存并展示表单错误。
 */
const budgetInvalid = (model: ProviderModel): boolean =>
  model.maxOutputTokens >= model.contextWindow;

/**
 * 思考内容字段名非法（如覆盖 role/content 等）。
 */
const reasoningFieldInvalid = (model: ProviderModel): boolean =>
  props.protocol !== 'anthropic' && !isValidReasoningField(model.reasoningField);

const extraText = (model: ProviderModel): string =>
  extraDrafts[model.id] ?? JSON.stringify(model.extraParams ?? {}, null, 2);

const updateExtraDraft = (model: ProviderModel, text: string): void => {
  extraDrafts[model.id] = text;
  try {
    const parsed = parseExtraParams(text, t('settings.modelExtraParamsInvalid'));
    const reserved = findReservedProviderParams(parsed);
    if (reserved.length) {
      throw new Error(t('settings.modelExtraParamsReserved', { keys: reserved.join(', ') }));
    }
    const sensitive = findSensitiveProviderParams(parsed);
    if (sensitive.length) {
      throw new Error(t('settings.modelExtraParamsSensitive', { keys: sensitive.join(', ') }));
    }
    delete extraErrors[model.id];
    updateModel(model.id, 'extraParams', Object.keys(parsed).length ? parsed : undefined);
  } catch (error) {
    extraErrors[model.id] =
      error instanceof Error ? error.message : t('settings.modelExtraParamsInvalid');
  }
};

const resetExtraDraft = (model: ProviderModel): void => {
  if (extraErrors[model.id]) return;
  delete extraDrafts[model.id];
};

const manualModelId = ref('');
const manualError = ref('');
const showManual = ref(false);

watch(
  () =>
    Object.keys(extraErrors).length === 0 &&
    !props.models.some(
      (model) => model.maxOutputTokens >= model.contextWindow || reasoningFieldInvalid(model)
    ),
  (valid) => emit('update:valid', valid),
  { immediate: true }
);

watch(
  () => rows.value.map((model) => model.id).join('\u0000'),
  () => {
    const ids = new Set(rows.value.map((model) => model.id));
    for (const id of new Set([...Object.keys(extraDrafts), ...Object.keys(extraErrors)])) {
      if (!ids.has(id)) {
        delete extraDrafts[id];
        delete extraErrors[id];
      }
    }
  }
);

watch(manualModelId, () => {
  manualError.value = '';
});

const isSelected = (id: string): boolean => props.models.some((model) => model.id === id);

const selectedCount = computed(() => rows.value.filter((model) => isSelected(model.id)).length);
const allSelected = computed(
  () => rows.value.length > 0 && selectedCount.value === rows.value.length
);
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value);

/**
 * 更新单个模型的窗口、输出上限或透传参数。
 */
const updateModel = (
  id: string,
  key: 'contextWindow' | 'maxOutputTokens' | 'reasoningPassback' | 'reasoningField' | 'extraParams',
  value: number | boolean | string | Record<string, unknown> | undefined | null
): void => {
  if (value === null) return;
  emit(
    'update:models',
    props.models.map((model) => {
      if (model.id !== id) return model;
      const next: ProviderModel = { ...model };
      if (key === 'contextWindow' || key === 'maxOutputTokens') {
        if (typeof value === 'number') next[key] = value;
      } else if (key === 'reasoningPassback') {
        if (typeof value === 'boolean') next.reasoningPassback = value;
      } else if (key === 'reasoningField') {
        const field = typeof value === 'string' ? value.trim() : '';
        if (field) next.reasoningField = field;
        else delete next.reasoningField;
      } else if (value && typeof value === 'object') {
        next.extraParams = value as Record<string, unknown>;
      } else {
        delete next.extraParams;
      }
      return next;
    })
  );
};

/**
 * 允许在模型列表接口不可用时手动添加模型 ID。
 */
const addManualModel = (): void => {
  const id = manualModelId.value.trim();
  if (!id) {
    manualError.value = t('settings.manualModelRequired');
    return;
  }
  if (isSelected(id)) {
    manualError.value = t('settings.modelAlreadyAdded');
    return;
  }
  const model: ProviderModel = {
    id,
    role: 'chat',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS
  };
  emit('update:models', [...props.models, model]);
  if (!props.defaultModelId) emit('update:defaultModelId', id);
  manualModelId.value = '';
};

/**
 * 勾选模型时添加默认预算；取消时移除并清理草稿。
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

  delete extraDrafts[id];
  delete extraErrors[id];
  const next = props.models.filter((model) => model.id !== id);
  emit('update:models', next);
  if (props.defaultModelId === id) emit('update:defaultModelId', next[0]?.id ?? '');
};

/**
 * 全选或清空当前模型列表；保留已选模型的配置。
 */
const toggleAll = (checked: boolean): void => {
  if (checked) {
    const next = rows.value.map(
      (model) => props.models.find((item) => item.id === model.id) ?? model
    );
    emit('update:models', next);
    if (!props.defaultModelId) emit('update:defaultModelId', next[0]?.id ?? '');
    return;
  }
  Object.keys(extraDrafts).forEach((id) => delete extraDrafts[id]);
  Object.keys(extraErrors).forEach((id) => delete extraErrors[id]);
  emit('update:models', []);
  if (props.defaultModelId) emit('update:defaultModelId', '');
};
</script>

<style scoped lang="less">
.nh-models-field {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 10px;
}

.nh-models-field__manual {
  display: flex;
  width: 100%;
  gap: 6px;
}

.nh-models-field__fallback {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-models-field__manual :deep(.n-input) {
  min-width: 0;
  flex: 1 1 auto;
}

.nh-models-field__manual :deep(.n-button) {
  flex: none;
}

.nh-models-field__manual-item {
  width: 100%;
  margin-bottom: 0;
  padding: 10px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 45%, transparent);
}

.nh-manual-enter-active,
.nh-manual-leave-active {
  transition:
    opacity var(--nh-duration-fast) var(--nh-ease-standard),
    transform var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-manual-enter-from,
.nh-manual-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .nh-models-field__fallback-chevron,
  .nh-manual-enter-active,
  .nh-manual-leave-active {
    transition: none;
  }
}

.nh-models-field__manual-item :deep(.n-form-item-blank) {
  width: 100%;
}

.nh-models-field__empty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--nh-border-subtle);
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

.nh-models-field__header-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nh-models-field__summary {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-models-field__list {
  display: flex;
  flex-direction: column;
  overflow: visible;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
}

.nh-model-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--nh-border-subtle);
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 2px 0 2px 26px;
  padding: 0;
}

.nh-model-row__row {
  display: grid;
  gap: 12px 28px;
}

.nh-model-row__row--budget,
.nh-model-row__row--reasoning {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.nh-model-row__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-model-row__field > span {
  min-width: 0;
  line-height: 1.4;
}

.nh-model-row__switch {
  display: flex;
  min-height: 28px;
  align-items: center;
}

.nh-model-row__field--extra {
  gap: 5px;
}

.nh-model-row__extra-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.nh-model-row__unit {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-model-row__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.nh-model-row__hint {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
  line-height: 1.5;
}

.nh-model-row__error {
  color: var(--nh-color-danger);
  font-size: 11px;
}

.nh-model-row__row--budget .nh-model-row__error {
  grid-column: 1 / -1;
}

@media (width <= 880px) {
  .nh-model-row__config {
    margin-left: 0;
  }
}

@media (width <= 640px) {
  .nh-model-row__row--budget,
  .nh-model-row__row--reasoning {
    grid-template-columns: 1fr;
  }
}
</style>
