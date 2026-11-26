<template>
  <section class="nh-provider-settings">
    <ProviderEmptyState v-if="providers.length === 0 && !isFormVisible" @create="startNew" />

    <ProviderListView
      v-else-if="!isFormVisible"
      :providers="providers"
      :busy-id="busyId"
      @create="startNew"
      @edit="editProvider"
      @toggle="handleToggle"
      @delete="handleDelete"
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
            <NFormItem
              class="nh-provider-settings__item"
              :label="t('settings.protocol')"
              path="protocol"
            >
              <NSelect
                :menu-props="selectMenuProps"
                :value="providerForm.protocol"
                :options="protocolOptions"
                :placeholder="t('settings.pleaseSelect')"
                @update:value="(value: ProviderProtocol) => (providerForm.protocol = value)"
              />
            </NFormItem>
            <NFormItem class="nh-provider-settings__item" :label="t('settings.name')" path="name">
              <NInput
                ref="nameInputRef"
                :value="providerForm.name"
                :placeholder="t('settings.pleaseInput')"
                @update:value="(value: string) => (providerForm.name = value)"
              />
            </NFormItem>

            <NFormItem
              class="nh-provider-settings__item"
              :label="t('settings.baseUrl')"
              path="baseUrl"
            >
              <NInput
                :value="providerForm.baseUrl"
                :placeholder="t('settings.pleaseInput')"
                @update:value="(value: string) => (providerForm.baseUrl = value)"
              />
            </NFormItem>

            <NFormItem
              class="nh-provider-settings__item"
              :label="t('settings.apiKey')"
              path="apiKey"
            >
              <NInput
                :value="providerForm.apiKey"
                type="password"
                show-password-on="click"
                :placeholder="t('settings.pleaseInput')"
                @update:value="(value: string) => (providerForm.apiKey = value)"
              />
            </NFormItem>

            <NFormItem
              class="nh-provider-settings__item"
              :label="t('settings.headers')"
              path="headers"
            >
              <div class="nh-provider-settings__headers">
                <NInput
                  :value="providerForm.headers"
                  type="textarea"
                  size="small"
                  :autosize="{ minRows: 2, maxRows: 8 }"
                  :placeholder="t('settings.headersPlaceholder')"
                  v-bind="headersError ? { status: 'error' } : {}"
                  @update:value="(value: string) => (providerForm.headers = value)"
                />
                <small class="nh-provider-settings__hint">{{ t('settings.headersHint') }}</small>
                <small v-if="headersError" class="nh-provider-settings__error">
                  {{ headersError }}
                </small>
              </div>
            </NFormItem>
          </div>
        </div>

        <div class="nh-provider-settings__section">
          <h3 class="nh-provider-settings__section-title">{{ t('settings.models') }}</h3>
          <NFormItem class="nh-provider-settings__item" path="models" :show-label="false">
            <ProviderModelsField
              :key="selectedId ?? 'new-provider'"
              :models="providerForm.models"
              :available-models="availableModels"
              :default-model-id="providerForm.defaultModelId"
              :testing="testing"
              :protocol="providerForm.protocol"
              @update:models="(value) => (providerForm.models = value)"
              @update:valid="(value: boolean) => (modelsExtraValid = value)"
              @update:default-model-id="(value) => (providerForm.defaultModelId = value)"
              @test="testConnection"
            />
          </NFormItem>
        </div>
      </NForm>

      <ProviderSettingsActions
        :saving="saving"
        :disabled="!modelsExtraValid || Boolean(headersError)"
        @back="backToList"
        @save="handleSave"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * 模型服务商设置：列表、连接、多模型、API Key 与模型预算。
 */

import { selectMenuProps } from '@/app/menu-props';
import { NForm, NFormItem, NInput, NSelect, type FormInst, type InputInst } from 'naive-ui';
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
import { parseHeaders } from '../validation/provider-headers';

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
  toggleProvider,
  deleteProviderById
} = useProviderSettings(() => {
  resetToList();
  emit('changed');
});

const rules = createProviderRules(selectedId, providerForm);
const protocolOptions = computed(() => [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' }
]);

/**
 * 自定义 Headers 校验：为空或合法字符串键值对象时通过。
 */
const headersError = computed(() => {
  try {
    parseHeaders(providerForm.value.headers, '');
    return '';
  } catch {
    return t('settings.headersInvalid');
  }
});

const formRef = ref<FormInst | null>(null);
const nameInputRef = ref<InputInst | null>(null);

const modelsExtraValid = ref(true);
const busyId = ref('');
const handleToggle = async (id: string, enabled: boolean): Promise<void> => {
  busyId.value = id;
  try {
    await toggleProvider(id, enabled);
  } finally {
    busyId.value = '';
  }
};
const handleDelete = async (id: string): Promise<void> => {
  busyId.value = id;
  try {
    await deleteProviderById(id);
  } finally {
    busyId.value = '';
  }
};

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
  border: 1px solid var(--nh-border-subtle);
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
  justify-content: space-between;
  gap: 16px;
}

.nh-provider-settings__field-title {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 12px;
}

.nh-provider-settings__field-hint {
  margin: 4px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-provider-settings__headers {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 4px;
}

.nh-provider-settings__hint {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-provider-settings__error {
  color: var(--nh-color-danger);
  font-size: 11px;
}
</style>
