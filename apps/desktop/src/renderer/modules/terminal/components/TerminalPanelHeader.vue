<template>
  <header class="nh-terminal-panel__header">
    <span class="nh-terminal-panel__title">
      <AppIcon name="terminal" :size="14" />
      {{ t('terminal.title') }}
    </span>
    <div class="nh-terminal-panel__actions">
      <NTooltip
        :theme="tooltipDark"
        :theme-overrides="terminalTooltipThemeOverrides"
        placement="bottom"
      >
        <template #trigger>
          <NButton
            text
            size="small"
            class="nh-terminal-panel__icon-button"
            :aria-label="t('terminal.search')"
            @click="emit('toggle-search')"
          >
            <template #icon>
              <AppIcon name="search" :size="17" />
            </template>
          </NButton>
        </template>
        {{ t('terminal.search') }}
      </NTooltip>
      <PluginSlot
        location="terminal.toolbar"
        :context="{ location: 'terminal.toolbar', sessionId }"
      />
      <NTooltip
        :theme="tooltipDark"
        :theme-overrides="terminalTooltipThemeOverrides"
        placement="bottom"
      >
        <template #trigger>
          <NButton
            text
            size="small"
            class="nh-terminal-panel__icon-button"
            :aria-label="t('terminal.hide')"
            @click="emit('hide')"
          >
            <template #icon>
              <AppIcon name="close" :size="17" />
            </template>
          </NButton>
        </template>
        {{ t('terminal.hide') }}
      </NTooltip>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * 终端面板标题栏：搜索、插件工具条与收起。
 */

import { NButton, NTooltip, tooltipDark } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import { terminalTooltipThemeOverrides } from '../terminal-theme';

defineProps<{ sessionId?: string | undefined }>();
const emit = defineEmits<{ 'toggle-search': []; hide: [] }>();
</script>

<style scoped lang="less">
.nh-terminal-panel__header {
  display: flex;
  height: 56px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--terminal-border);
}

.nh-terminal-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--terminal-secondary);
  font-size: 12px;
}

.nh-terminal-panel__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-terminal-panel__icon-button {
  width: 28px;
  height: 28px;
}

.nh-terminal-panel__actions :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-panel__actions :deep(.n-button:hover) {
  color: var(--terminal-text);
}
</style>
