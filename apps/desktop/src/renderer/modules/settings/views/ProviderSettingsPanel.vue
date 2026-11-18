<template>
  <section class="nh-provider-settings">
    <ProviderEmptyState v-if="providers.length === 0 && !isFormVisible" @create="startNew" />

    <ProviderListView
      v-else-if="!isFormVisible"
      :providers="providers"
      @create="startNew"
      @edit="editProvider"
    />

    <template v-else>
      <NForm
        ref="formRef"
        class="nh-provider-settings__form"
        :model="providerForm"
        :rules="rules"
        label-placement="top"
        size="small"
      >
        <div class="nh-provider-settings__section">
          <h3 class="nh-provider-settings__section-title">{{ t('settings.connection') }}</h3>
          <div class="nh-provider-settings__panel">
            <div class="nh-provider-settings__grid">
              <NFormItem
                class="nh-provider-settings__item"
                :label="t('settings.protocol')"
                path="protocol"
              >
                <NSelect
                  :value="providerForm.protocol"
                  :options="protocolOptions"
                  @update:value="(value: ProviderProtocol) => (providerForm.protocol = value)"
                />
              </NFormItem>
              <NFormItem class="nh-provider-settings__item" :label="t('settings.name')" path="name">
                <NInput
                  ref="nameInputRef"
                  :value="providerForm.name"
                  :placeholder="t('settings.namePlaceholder')"
                  @update:value="(value: string) => (providerForm.name = value)"
                />
              </NFormItem>
            </div>

            <NFormItem
              class="nh-provider-settings__item"
              :label="t('settings.baseUrl')"
              path="baseUrl"
            >
              <NInput
                :value="providerForm.baseUrl"
                :placeholder="baseUrlPlaceholder"
                @update:value="(value: string) => (providerForm.baseUrl = value)"
              />
            </NFormItem>

            <div class="nh-provider-settings__grid">
              <NFormItem
                class="nh-provider-settings__item"
                :label="t('settings.apiKey')"
                path="apiKey"
              >
                <NInput
                  :value="providerForm.apiKey"
                  type="password"
                  show-password-on="click"
                  :placeholder="t('settings.apiKeyPlaceholder')"
                  @update:value="(value: string) => (providerForm.apiKey = value)"
                />
              </NFormItem>
              <NFormItem class="nh-provider-settings__item" :label="t('settings.enabled')">
                <div class="nh-provider-settings__enabled">
                  <NSwitch
                    :value="providerForm.enabled"
                    @update:value="(value: boolean) => (providerForm.enabled = value)"
                  />
                </div>
              </NFormItem>
            </div>
          </div>
        </div>

        <div class="nh-provider-settings__section">
          <h3 class="nh-provider-settings__section-title">{{ t('settings.models') }}</h3>
          <NFormItem class="nh-provider-settings__item" path="models" :show-label="false">
            <ProviderModelsField
              :models="providerForm.models"
              :available-models="availableModels"
              :default-model-id="providerForm.defaultModelId"
              :testing="testing"
              @update:models="(value) => (providerForm.models = value)"
              @update:default-model-id="(value) => (providerForm.defaultModelId = value)"
              @test="testConnection"
            />
          </NFormItem>
        </div>
      </NForm>

      <ProviderSettingsActions
        :selected="Boolean(selectedId)"
        :saving="saving"
        @back="backToList"
        @save="handleSave"
        @delete="deleteProvider"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * 模型服务商设置：列表、连接、多模型、API Key 与模型预算。
 */

import {
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
  type FormInst,
  type InputInst
} from 'naive-ui';
import { computed, ref } from 'vue';
import type { ProviderProtocol } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import ProviderEmptyState from '../components/ProviderEmptyState.vue';
import ProviderListView from '../components/ProviderListView.vue';
import ProviderModelsField from '../components/ProviderModelsField.vue';
import ProviderSettingsActions from '../components/ProviderSettingsActions.vue';
import { useProviderSettings } from '../composables/use-provider-settings';
import { useProviderFormControls } from '../composables/use-provider-form-controls';
import { createProviderRules } from '../validation/provider-validation';

const emit = defineEmits<{ changed: [] }>();

let resetToList: () => void = () => undefined;

const {
  providers,
  selectedId,
  providerForm,
  saving,
  availableModels,
  testing,
  testConnection,
  selectProvider,
  newProvider,
  saveProviderForm,
  deleteProvider
} = useProviderSettings(() => {
  resetToList();
  emit('changed');
});

const rules = createProviderRules(selectedId, providerForm);
const protocolOptions = computed(() => [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama', value: 'ollama' }
]);
const baseUrlPlaceholder = computed(() =>
  providerForm.value.protocol === 'ollama'
    ? 'http://127.0.0.1:11434/v1'
    : providerForm.value.protocol === 'anthropic'
      ? 'https://api.anthropic.com'
      : t('settings.baseUrlPlaceholder')
);
const formRef = ref<FormInst | null>(null);
const nameInputRef = ref<InputInst | null>(null);

const { isFormVisible, startNew, startEdit, backToList, handleSave } = useProviderFormControls({
  selectedId,
  newProvider,
  saveProviderForm,
  formRef,
  nameInputRef
});

resetToList = backToList;

/**
 * 从列表进入 Provider 编辑。
 */
const editProvider = (id: string): void => {
  selectProvider(id);
  startEdit();
};
</script>

<style scoped lang="less">
.nh-provider-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nh-provider-settings__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nh-provider-settings__section-title {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-provider-settings__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-provider-settings__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nh-provider-settings__item {
  margin-bottom: 0;
}

.nh-provider-settings__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 12px;
}

.nh-provider-settings__enabled {
  display: flex;
  min-height: 28px;
  align-items: center;
}
</style>
