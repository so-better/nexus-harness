<template>
  <footer class="nh-statusbar">
    <div class="nh-statusbar__group">
      <NTag size="small" :type="running ? 'info' : 'default'" :bordered="false">
        {{ running ? t('app.running') : t('app.idle') }}
      </NTag>

      <NPopover placement="top-start" trigger="click" :show-arrow="false">
        <template #trigger>
          <NButton text size="tiny">{{ totalTokens.toLocaleString('zh-CN') }} tokens</NButton>
        </template>
        <div class="nh-usage">
          <p class="nh-usage__model">{{ modelLabel || '—' }}</p>
          <div class="nh-usage__row">
            <span>{{ t('app.tokensIn') }}</span>
            <strong>{{ usage.inputTokens.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="nh-usage__row">
            <span>{{ t('app.tokensOut') }}</span>
            <strong>{{ usage.outputTokens.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="nh-usage__row">
            <span>{{ t('app.cost') }}</span>
            <strong>{{ usage.cost.toFixed(4) }}</strong>
          </div>
          <template v-if="errors.length">
            <NDivider />
            <p v-for="message in errors" :key="message" class="nh-usage__error">{{ message }}</p>
          </template>
        </div>
      </NPopover>
    </div>

    <div class="nh-statusbar__group">
      <div class="nh-theme-control" role="group" :aria-label="t('app.theme')">
        <NButton
          v-for="option in themeOptions"
          :key="option.value"
          size="tiny"
          quaternary
          :type="themeSource === option.value ? 'primary' : 'default'"
          :aria-label="option.label"
          :aria-pressed="themeSource === option.value"
          :title="option.label"
          @click="emit('update-theme', option.value)"
        >
          <template #icon>
            <AppIcon :name="option.icon" :size="14" />
          </template>
        </NButton>
      </div>
      <NButton text size="tiny" @click="emit('open-settings')">{{ t('app.settings') }}</NButton>
      <NText depth="3">{{ t('app.version') }} {{ version }}</NText>
    </div>
  </footer>
</template>

<script setup lang="ts">
/**
 * 状态栏：运行状态、用量浮层、主题、设置与版本。
 */

import { computed } from 'vue';
import { NButton, NDivider, NPopover, NTag, NText } from 'naive-ui';
import type { ThemeSource } from '@shared/ipc/contracts';
import type { ChatUsage } from '@/modules/chat/types';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  running: boolean;
  usage: ChatUsage;
  modelLabel: string;
  errors: string[];
  themeSource: ThemeSource;
  version: string;
}>();

const emit = defineEmits<{ 'update-theme': [source: ThemeSource]; 'open-settings': [] }>();

const totalTokens = computed(() => props.usage.inputTokens + props.usage.outputTokens);
const themeOptions = computed(() => [
  { value: 'system' as const, icon: 'monitor' as const, label: t('settings.themeSystem') },
  { value: 'light' as const, icon: 'sun' as const, label: t('settings.themeLight') },
  { value: 'dark' as const, icon: 'moon' as const, label: t('settings.themeDark') }
]);
</script>

<style scoped lang="less">
.nh-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-top: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
  font-size: 12px;
}

.nh-statusbar__group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nh-theme-control {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--nh-color-border);
  border-radius: 6px;
  background: var(--nh-color-bg-base);
}

.nh-usage {
  display: flex;
  width: 240px;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.nh-usage__model {
  overflow: hidden;
  margin: 0;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-usage__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-usage__row strong {
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-weight: 500;
}

.nh-usage__error {
  margin: 0;
  color: var(--nh-color-danger);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
