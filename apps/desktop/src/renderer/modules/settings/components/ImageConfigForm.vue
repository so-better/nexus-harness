<template>
  <section class="nh-image-form">
    <div class="nh-image-form__header">
      <div>
        <h3>{{ isEditing ? t('settings.imageEdit') : t('settings.imageAdd') }}</h3>
        <p>{{ t('settings.imageFormHint') }}</p>
      </div>
    </div>

    <NForm class="nh-image-form__form" label-placement="top" size="small">
      <section class="nh-image-form__section">
        <h4 class="nh-image-form__section-title">{{ t('settings.connection') }}</h4>
        <div class="nh-image-form__panel">
          <div class="nh-image-form__grid">
            <NFormItem
              :label="t('settings.imageName')"
              :validation-status="nameError ? 'error' : 'success'"
              :show-feedback="Boolean(nameError)"
              :feedback="nameError"
            >
              <NInput v-model:value="name" :placeholder="t('settings.pleaseInput')" />
            </NFormItem>
            <NFormItem
              :label="t('settings.imageModel')"
              :validation-status="modelError ? 'error' : 'success'"
              :show-feedback="Boolean(modelError)"
              :feedback="modelError"
            >
              <NInput v-model:value="model" :placeholder="t('settings.pleaseInput')" />
            </NFormItem>
          </div>
          <NFormItem :label="t('settings.imageApiKey')">
            <NInput
              v-model:value="apiKey"
              type="password"
              show-password-on="click"
              :placeholder="t('settings.pleaseInput')"
            />
          </NFormItem>
        </div>
      </section>

      <section class="nh-image-form__section">
        <div class="nh-image-form__section-head">
          <h4 class="nh-image-form__section-title">{{ t('settings.imageTemplate') }}</h4>
          <div class="nh-image-form__presets">
            <NButton text type="primary" size="small" @click="applySyncPreset">
              {{ t('settings.imageSyncPreset') }}
            </NButton>
            <NButton text type="primary" size="small" @click="applyAsyncPreset">
              {{ t('settings.imageAsyncPreset') }}
            </NButton>
          </div>
        </div>
        <div class="nh-image-form__panel">
          <div class="nh-image-form__template">
            <MonacoEditor v-model="templateText" language="json" height="380px" />
            <p v-if="templateError" class="nh-image-form__error">{{ templateError }}</p>
            <p class="nh-image-form__hint">{{ t('settings.imageTemplateHint') }}</p>
          </div>
        </div>
      </section>
    </NForm>

    <div class="nh-image-form__actions">
      <NButton tertiary @click="emit('cancel')">
        <template #icon>
          <AppIcon name="chevron-left" :size="14" />
        </template>
        {{ t('settings.backToList') }}
      </NButton>
      <NButton type="primary" :loading="saving" @click="submit">
        <template #icon>
          <AppIcon name="check" :size="14" />
        </template>
        {{ t('settings.save') }}
      </NButton>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 生图配置表单：基础信息与完整接口模板。
 */

import { defineAsyncComponent, ref, watch } from 'vue';
import { NButton, NForm, NFormItem, NInput } from 'naive-ui';
import { imageTemplateSchema, type ImageConfig, type ImageTemplate } from '@shared/image';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'));

const props = defineProps<{
  config: ImageConfig | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [config: ImageConfig];
}>();

const SYNC_TEMPLATE: ImageTemplate = {
  url: '',
  method: 'POST',
  body: {
    model: '{{model}}',
    prompt: '{{prompt}}',
    size: '{{size}}',
    images: '{{image_urls}}'
  },
  result: {
    paths: ['data.0.url', 'data.0.b64_json'],
    encoding: 'auto'
  }
};

const ASYNC_TEMPLATE: ImageTemplate = {
  ...SYNC_TEMPLATE,
  poll: {
    path: 'https://your-host/tasks/{{id}}',
    id_path: 'id',
    status_path: 'status',
    success: ['succeeded', 'success', 'completed'],
    failed: ['failed', 'error'],
    result_path: 'data.0.url',
    interval_ms: 2_000,
    timeout_ms: 300_000
  }
};

const name = ref(props.config?.name ?? '');
const model = ref(props.config?.model ?? '');
const apiKey = ref(props.config?.apiKey ?? '');
const templateText = ref(JSON.stringify(props.config?.template ?? SYNC_TEMPLATE, null, 2));
const nameError = ref('');
const modelError = ref('');
const templateError = ref('');

watch(name, () => (nameError.value = ''));
watch(model, () => (modelError.value = ''));
watch(templateText, () => (templateError.value = ''));

const isEditing = props.config !== null;

const applySyncPreset = (): void => {
  templateText.value = JSON.stringify(SYNC_TEMPLATE, null, 2);
};

const applyAsyncPreset = (): void => {
  templateText.value = JSON.stringify(ASYNC_TEMPLATE, null, 2);
};

const submit = (): void => {
  nameError.value = name.value.trim() ? '' : t('settings.imageNameRequired');
  modelError.value = model.value.trim() ? '' : t('settings.imageModelRequired');
  if (nameError.value || modelError.value) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(templateText.value);
  } catch {
    templateError.value = t('settings.imageTemplateInvalid');
    return;
  }
  const result = imageTemplateSchema.safeParse(parsed);
  if (!result.success) {
    templateError.value = t('settings.imageTemplateInvalid');
    return;
  }

  emit('save', {
    id: props.config?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    model: model.value.trim(),
    ...(apiKey.value ? { apiKey: apiKey.value } : {}),
    enabled: props.config?.enabled ?? true,
    template: result.data
  });
};
</script>

<style scoped lang="less">
.nh-image-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nh-image-form__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nh-image-form__header h3 {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.nh-image-form__header p {
  max-width: 600px;
  margin: 6px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-image-form__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nh-image-form__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-image-form__section-title {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-image-form__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-image-form__panel :deep(.n-form-item) {
  margin-bottom: 0;
}

.nh-image-form__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.nh-image-form__template {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 10px;
}

.nh-image-form__presets {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nh-image-form__presets :deep(.n-button) {
  font-size: 12px;
}

.nh-image-form__error {
  margin: 0;
  color: var(--nh-color-danger);
  font-size: 12px;
}

.nh-image-form__hint {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--nh-border-subtle);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-image-form__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--nh-border-subtle);
}
</style>
