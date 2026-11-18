<template>
  <NPopover
    v-model:show="open"
    trigger="click"
    placement="top-end"
    :disabled="disabled"
    :show-arrow="false"
    :content-style="{ padding: '4px' }"
  >
    <template #trigger>
      <button
        type="button"
        class="nh-mode-select"
        :class="`nh-mode-select--${mode}`"
        aria-haspopup="menu"
        :title="activeHint"
        :aria-label="`${t('mode.label')}: ${activeLabel}`"
        :disabled="disabled"
      >
        <span class="nh-mode-select__dot" />
        <span>{{ activeLabel }}</span>
        <AppIcon name="chevron-down" :size="12" />
      </button>
    </template>

    <AgentModeMenu :mode="mode" @select="choose" />
  </NPopover>
</template>

<script setup lang="ts">
/**
 * Agent 模式选择：与模型选择一致的浮层交互，默认 Build。
 */

import { computed, ref } from 'vue';
import { NPopover } from 'naive-ui';
import type { AgentMode } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import AgentModeMenu from './AgentModeMenu.vue';

const props = defineProps<{
  mode: AgentMode;
  disabled: boolean;
}>();

const emit = defineEmits<{ 'update-mode': [mode: AgentMode] }>();

const open = ref(false);

const activeLabel = computed(() => (props.mode === 'plan' ? t('mode.plan') : t('mode.build')));
const activeHint = computed(() =>
  props.mode === 'plan' ? t('mode.planHint') : t('mode.buildHint')
);

/**
 * 选中模式后关闭浮层，持久化由会话 store 完成。
 */
const choose = (mode: AgentMode): void => {
  open.value = false;
  if (mode !== props.mode) emit('update-mode', mode);
};
</script>

<style scoped lang="less">
.nh-mode-select {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-mode-select:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: 1px;
}

.nh-mode-select:disabled {
  cursor: default;
  opacity: 0.55;
}

.nh-mode-select:hover:not(:disabled) {
  background: var(--nh-color-bg-hover);
}

.nh-mode-select--plan {
  color: var(--nh-color-warning);
}

.nh-mode-select--build {
  color: var(--nh-color-success);
}

.nh-mode-select__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}
</style>
