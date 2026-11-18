<template>
  <section class="nh-provider-settings">
    <div class="nh-provider-settings__toolbar">
      <NSelect
        class="nh-provider-settings__select"
        size="small"
        :value="selectedId"
        :options="providerOptions"
        :placeholder="t('settings.noProviders')"
        :disabled="providers.length === 0"
        @update:value="selectProvider"
      />
      <NButton size="small" secondary @click="newProvider">
        {{ t('settings.newProvider') }}
      </NButton>
    </div>

    <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>
    <NAlert v-if="saved" type="success" :show-icon="false">{{ t('settings.saved') }}</NAlert>

    <div class="nh-provider-settings__form">
      <div class="nh-provider-settings__grid">
        <label class="nh-provider-settings__field">
          <span class="nh-provider-settings__label">{{ t('settings.name') }}</span>
          <NInput
            :value="providerForm.name"
            placeholder="OpenAI"
            @update:value="(value: string) => (providerForm.name = value)"
          />
        </label>
        <label class="nh-provider-settings__field">
          <span class="nh-provider-settings__label">{{ t('settings.model') }}</span>
          <NInput
            :value="providerForm.model"
            placeholder="gpt-4.1"
            @update:value="(value: string) => (providerForm.model = value)"
          />
        </label>
      </div>

      <label class="nh-provider-settings__field">
        <span class="nh-provider-settings__label">{{ t('settings.baseUrl') }}</span>
        <NInput
          :value="providerForm.baseUrl"
          placeholder="https://api.openai.com/v1"
          @update:value="(value: string) => (providerForm.baseUrl = value)"
        />
      </label>

      <label class="nh-provider-settings__field">
        <span class="nh-provider-settings__label">{{ t('settings.apiKey') }}</span>
        <NInput
          :value="providerForm.apiKey"
          type="password"
          show-password-on="click"
          :placeholder="selectedId ? t('settings.apiKeyHint') : 'sk-...'"
          @update:value="(value: string) => (providerForm.apiKey = value)"
        />
      </label>

      <div class="nh-provider-settings__grid">
        <label class="nh-provider-settings__field">
          <span class="nh-provider-settings__label">{{ t('settings.contextWindow') }}</span>
          <NInputNumber
            :value="providerForm.contextWindow"
            :min="4096"
            :step="1024"
            @update:value="(value: number | null) => (providerForm.contextWindow = value)"
          />
        </label>
        <label class="nh-provider-settings__field">
          <span class="nh-provider-settings__label">{{ t('settings.maxOutputTokens') }}</span>
          <NInputNumber
            :value="providerForm.maxOutputTokens"
            :min="256"
            :step="256"
            @update:value="(value: number | null) => (providerForm.maxOutputTokens = value)"
          />
        </label>
      </div>

      <div class="nh-provider-settings__switch">
        <NText depth="3">{{ t('settings.enabled') }}</NText>
        <NSwitch
          :value="providerForm.enabled"
          @update:value="(value: boolean) => (providerForm.enabled = value)"
        />
      </div>
    </div>

    <div class="nh-provider-settings__actions">
      <NPopconfirm v-if="selectedId" @positive-click="deleteProvider">
        <template #trigger>
          <NButton size="small" type="error" secondary>
            {{ t('settings.deleteProvider') }}
          </NButton>
        </template>
        {{ t('settings.deleteProvider') }}?
      </NPopconfirm>
      <span class="nh-provider-settings__spacer" />
      <NButton size="small" type="primary" :loading="saving" @click="saveProviderForm">
        {{ t('settings.save') }}
      </NButton>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 模型提供商设置：列表、编辑、API Key 与上下文预算。
 */

import {
  NAlert,
  NButton,
  NInput,
  NInputNumber,
  NPopconfirm,
  NSelect,
  NSwitch,
  NText
} from 'naive-ui';
import { t } from '@/app/i18n';
import { useProviderSettings } from '../composables/use-provider-settings';

const emit = defineEmits<{ changed: [] }>();

const {
  providers,
  selectedId,
  providerOptions,
  providerForm,
  error,
  saved,
  saving,
  selectProvider,
  newProvider,
  saveProviderForm,
  deleteProvider
} = useProviderSettings(() => emit('changed'));
</script>

<style scoped lang="less">
.nh-provider-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nh-provider-settings__toolbar {
  display: flex;
  gap: 8px;
}

.nh-provider-settings__select {
  flex: 1;
}

.nh-provider-settings__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nh-provider-settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nh-provider-settings__label {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-provider-settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.nh-provider-settings__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.nh-provider-settings__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-provider-settings__spacer {
  flex: 1;
}
</style>
