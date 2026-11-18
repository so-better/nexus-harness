<template>
  <form class="nh-composer" :class="{ 'nh-composer--hero': hero }" @submit.prevent="submit">
    <div class="nh-composer__toolbar">
      <NPopover trigger="click" placement="top-start" :show-arrow="false">
        <template #trigger>
          <NButton text size="small">
            <template #icon>
              <AppIcon name="folder" />
            </template>
            {{ rootLabel }}
          </NButton>
        </template>
        <div class="nh-roots">
          <div v-for="root in roots" :key="root.id" class="nh-roots__item" :title="root.path">
            <span class="nh-roots__copy">
              <span class="nh-roots__name">{{ rootName(root.path) }}</span>
              <span class="nh-roots__path">{{ root.path }}</span>
            </span>
            <NButton
              text
              size="tiny"
              :title="t('app.removeRoot')"
              :aria-label="t('app.removeRoot')"
              @click="emit('remove-root', root.id)"
            >
              <template #icon><AppIcon name="trash" :size="12" /></template>
            </NButton>
          </div>
          <NButton text size="small" class="nh-roots__add" @click="emit('choose-root')">
            <template #icon><AppIcon name="plus" :size="13" /></template>
            {{ t('app.chooseRoot') }}
          </NButton>
        </div>
      </NPopover>
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
      @keydown.tab="onTab"
    />
    <div class="nh-composer__actions">
      <div class="nh-composer__hint-row">
        <NText v-if="disabledReason" depth="3" class="nh-composer__hint">
          {{ disabledReason }}
        </NText>
        <span v-else class="nh-composer__keys">{{ t('chat.composerHint') }}</span>
      </div>
      <div class="nh-composer__send-group">
        <AgentModeSelect
          :mode="mode"
          :disabled="running"
          @update-mode="emit('update-mode', $event)"
        />
        <NButton v-if="running" type="error" secondary @click="emit('stop')">
          <template #icon>
            <AppIcon name="stop" />
          </template>
          {{ t('app.stop') }}
        </NButton>
        <NButton
          v-else
          type="primary"
          quaternary
          :disabled="disabled || !draft.trim()"
          attr-type="submit"
        >
          <template #icon>
            <AppIcon name="send" />
          </template>
          {{ t('app.send') }}
        </NButton>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * 输入区：Enter 发送、Shift+Enter 换行，运行中显示停止按钮。
 */

import { computed, ref } from 'vue';
import { NButton, NDropdown, NInput, NPopover, NText, type DropdownOption } from 'naive-ui';
import type { AgentMode, ProviderModel, ProviderPublic, SessionRoot } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import AgentModeSelect from './AgentModeSelect.vue';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  roots: SessionRoot[];
  providers: ProviderPublic[];
  models: ProviderModel[];
  mode: AgentMode;
  providerId?: string | undefined;
  modelId?: string | undefined;
  hero?: boolean;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'open-settings': [];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
}>();

const draft = ref('');

/**
 * 从路径提取展示名，兼容 Windows 分隔符。
 */
const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
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

/**
 * 输入框内 Tab 切换 Plan/Build；带修饰键或运行中保留原生焦点导航。
 */
const onTab = (event: KeyboardEvent): void => {
  if (
    event.isComposing ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    props.running
  ) {
    return;
  }
  event.preventDefault();
  emit('update-mode', props.mode === 'plan' ? 'build' : 'plan');
};
</script>

<style scoped lang="less">
.nh-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  width: calc(100% - 64px);
  max-width: 1040px;
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

.nh-roots {
  display: flex;
  width: 320px;
  flex-direction: column;
  gap: 2px;
}

.nh-roots__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}

.nh-roots__item:hover {
  background: var(--nh-color-bg-hover);
}

.nh-roots__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.nh-roots__name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-roots__path {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-roots__add {
  align-self: flex-start;
  margin-top: 2px;
}

.nh-composer__send-group {
  display: flex;
  flex: none;
  align-items: center;
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
