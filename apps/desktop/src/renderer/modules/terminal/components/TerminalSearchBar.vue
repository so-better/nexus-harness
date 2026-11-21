<template>
  <div class="nh-terminal-search">
    <NInput
      ref="inputRef"
      :value="term"
      size="small"
      :placeholder="t('terminal.searchPlaceholder')"
      @update:value="emit('update:term', $event)"
      @keydown.enter.prevent="emit('run', $event.shiftKey ? 'previous' : 'next')"
      @keydown.esc.prevent="emit('close')"
    />
    <span v-if="noResult" class="nh-terminal-search__empty">{{ t('terminal.noResult') }}</span>
    <NTooltip
      :theme="tooltipDark"
      :theme-overrides="terminalTooltipThemeOverrides"
      placement="bottom"
    >
      <template #trigger>
        <NButton text size="tiny" @click="emit('run', 'previous')">
          <template #icon>
            <AppIcon name="chevron-up" :size="14" />
          </template>
        </NButton>
      </template>
      {{ t('terminal.previous') }}
    </NTooltip>
    <NTooltip
      :theme="tooltipDark"
      :theme-overrides="terminalTooltipThemeOverrides"
      placement="bottom"
    >
      <template #trigger>
        <NButton text size="tiny" @click="emit('run', 'next')">
          <template #icon>
            <AppIcon name="chevron-down" :size="14" />
          </template>
        </NButton>
      </template>
      {{ t('terminal.next') }}
    </NTooltip>
    <NTooltip
      :theme="tooltipDark"
      :theme-overrides="terminalTooltipThemeOverrides"
      placement="bottom"
    >
      <template #trigger>
        <NButton text size="tiny" @click="emit('close')">
          <template #icon>
            <AppIcon name="close" :size="14" />
          </template>
        </NButton>
      </template>
      {{ t('terminal.closeSearch') }}
    </NTooltip>
  </div>
</template>

<script setup lang="ts">
/**
 * 终端搜索栏：输入、上一个/下一个与关闭。
 */

import { ref } from 'vue';
import { NButton, NInput, NTooltip, tooltipDark, type InputInst } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { terminalTooltipThemeOverrides } from '../terminal-theme';

defineProps<{ term: string; noResult: boolean }>();
const inputRef = ref<InputInst>();
const emit = defineEmits<{
  'update:term': [value: string];
  run: [direction: 'next' | 'previous'];
  close: [];
}>();

const focus = (): void => {
  inputRef.value?.focus();
  inputRef.value?.select();
};

defineExpose({ focus });
</script>

<style scoped lang="less">
.nh-terminal-search {
  position: absolute;
  z-index: 20;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 24px);
  padding: 4px;
  border: 1px solid var(--terminal-border);
  border-radius: 8px;
  background: var(--terminal-surface);
  box-shadow: var(--nh-shadow-popover);
}

.nh-terminal-search :deep(.n-input) {
  width: 220px;

  --n-color: var(--terminal-bg);
  --n-color-focus: var(--terminal-bg);
  --n-text-color: var(--terminal-text);
  --n-border: 1px solid var(--terminal-border);
  --n-border-focus: 1px solid var(--terminal-accent);
  --n-border-hover: 1px solid var(--terminal-accent);
}

.nh-terminal-search__empty {
  color: var(--terminal-danger);
  font-size: 11px;
  white-space: nowrap;
}

.nh-terminal-search :deep(.n-button) {
  color: var(--terminal-secondary);
}

.nh-terminal-search :deep(.n-button:hover) {
  color: var(--terminal-text);
}
</style>
