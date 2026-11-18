<template>
  <form class="nh-composer" :class="{ 'nh-composer--hero': hero }" @submit.prevent="submit">
    <div class="nh-composer__toolbar">
      <NButton text size="small" @click="emit('choose-root')">
        <template #icon>
          <AppIcon name="folder" />
        </template>
        {{ rootLabel }}
      </NButton>
      <NButton v-if="providers.length === 0" size="tiny" secondary @click="emit('open-settings')">
        <template #icon>
          <AppIcon name="settings" :size="14" />
        </template>
        {{ t('chat.configureModel') }}
      </NButton>
      <div v-else class="nh-composer__selectors">
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
      </div>
    </div>
    <NInput
      v-model:value="draft"
      type="textarea"
      :bordered="false"
      :autosize="{ minRows: 2, maxRows: 6 }"
      :placeholder="placeholder"
      :disabled="disabled || running"
      @keydown.enter.exact.prevent="onEnter"
    />
    <div class="nh-composer__actions">
      <div class="nh-composer__hint-row">
        <NText v-if="disabledReason" depth="3" class="nh-composer__hint">
          {{ disabledReason }}
        </NText>
        <span v-else class="nh-composer__keys">{{ t('chat.composerHint') }}</span>
      </div>
      <NButton v-if="running" type="error" secondary @click="emit('stop')">
        <template #icon>
          <AppIcon name="stop" />
        </template>
        {{ t('app.stop') }}
      </NButton>
      <NButton v-else type="primary" :disabled="disabled || !draft.trim()" attr-type="submit">
        <template #icon>
          <AppIcon name="send" />
        </template>
        {{ t('app.send') }}
      </NButton>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * 输入区：Enter 发送、Shift+Enter 换行，运行中显示停止按钮。
 */

import { computed, ref } from 'vue';
import { NButton, NDropdown, NInput, NText, type DropdownOption } from 'naive-ui';
import type { ProviderModel, ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  providers: ProviderPublic[];
  models: ProviderModel[];
  providerId?: string | undefined;
  modelId?: string | undefined;
  hero?: boolean;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'update-provider': [id: string];
  'open-settings': [];
  'update-model': [id: string];
}>();

const draft = ref('');
const placeholder = computed(() => t('chat.composerPlaceholder'));
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

/**
 * 切换当前模型提供商。
 */
const onProviderChange = (key: string | number): void => {
  if (typeof key === 'string' && key) emit('update-provider', key);
};

/**
 * 切换当前模型。
 */
const onModelChange = (key: string | number): void => {
  if (typeof key === 'string' && key) emit('update-model', key);
};

/**
 * 提交非空消息并清空输入。
 */
const submit = (): void => {
  const prompt = draft.value.trim();
  if (!prompt || props.disabled || props.running) return;
  draft.value = '';
  emit('send', prompt);
};

/**
 * Enter 发送；输入法组合状态下交给输入法处理。
 */
const onEnter = (event: KeyboardEvent): void => {
  if (event.isComposing) return;
  submit();
};
</script>

<style scoped lang="less">
.nh-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  width: calc(100% - 64px);
  max-width: 820px;
  margin: 0 auto 24px;
  padding: 10px 12px 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: 16px;
  background: var(--nh-color-bg-base);
  box-shadow: var(--nh-shadow-card);
  transition:
    border-color var(--nh-duration-fast) var(--nh-ease-standard),
    box-shadow var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-composer:focus-within {
  border-color: color-mix(in srgb, var(--nh-color-accent) 45%, var(--nh-color-border));
  box-shadow:
    var(--nh-shadow-card),
    0 0 0 3px color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
}

.nh-composer--hero {
  padding: 14px 16px 10px;
  border-radius: 16px;
  box-shadow: var(--nh-shadow-float);
}

.nh-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--nh-color-border);
}

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

.nh-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.nh-composer__hint-row {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
}

.nh-composer__hint {
  font-size: 12px;
}

.nh-composer__keys {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}
</style>
