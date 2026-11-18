<template>
  <form class="nh-composer" @submit.prevent="submit">
    <div class="nh-composer__toolbar">
      <NButton text size="small" @click="emit('choose-root')">
        <template #icon>
          <AppIcon name="folder" />
        </template>
        {{ rootLabel }}
      </NButton>
      <NSelect
        class="nh-composer__provider"
        size="tiny"
        :value="providerId ?? null"
        :options="providerOptions"
        :disabled="providers.length === 0"
        :placeholder="t('app.noProvider')"
        @update:value="onProviderChange"
      />
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
        <span v-else class="nh-composer__keys">
          <kbd>Enter</kbd>
          <span>{{ t('chat.composerHint') }}</span>
        </span>
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
import { NButton, NInput, NSelect, NText, type SelectOption } from 'naive-ui';
import type { ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  providers: ProviderPublic[];
  providerId?: string | undefined;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'update-provider': [id: string];
}>();

const draft = ref('');
const placeholder = computed(() => t('chat.composerPlaceholder'));
const providerOptions = computed<SelectOption[]>(() =>
  props.providers.map((provider) => ({
    label: `${provider.name} · ${provider.model}`,
    value: provider.id,
    disabled: !provider.enabled
  }))
);

/**
 * 切换当前模型提供商。
 */
const onProviderChange = (value: string): void => {
  if (value) emit('update-provider', value);
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
}

.nh-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--nh-color-border);
}

.nh-composer__provider {
  width: 220px;
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

.nh-composer__keys kbd {
  padding: 2px 6px;
  border: 1px solid var(--nh-color-border);
  border-radius: 4px;
  background: var(--nh-color-bg-elevated);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}
</style>
