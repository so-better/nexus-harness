<template>
  <div class="nh-mode-menu" role="menu">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="menuitemradio"
      class="nh-mode-option"
      :class="[
        `nh-mode-option--${option.value}`,
        { 'nh-mode-option--active': mode === option.value }
      ]"
      :aria-checked="mode === option.value"
      @click="emit('select', option.value)"
    >
      <span class="nh-mode-option__title">
        <span class="nh-mode-option__dot" />
        {{ option.label }}
      </span>
      <span class="nh-mode-option__description">{{ option.description }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Agent 模式菜单项。
 */

import { computed } from 'vue';
import type { AgentMode } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

defineProps<{ mode: AgentMode }>();

const emit = defineEmits<{ select: [mode: AgentMode] }>();

const options = computed<Array<{ value: AgentMode; label: string; description: string }>>(() => [
  {
    value: 'build',
    label: t('mode.build'),
    description: t('mode.buildDesc')
  },
  {
    value: 'plan',
    label: t('mode.plan'),
    description: t('mode.planDesc')
  }
]);
</script>

<style scoped lang="less">
.nh-mode-menu {
  display: flex;
  width: 310px;
  flex-direction: column;
  gap: 2px;
}

.nh-mode-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nh-color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nh-mode-option__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.nh-mode-option__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}

.nh-mode-option__description {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-mode-option:hover {
  background: var(--nh-color-bg-hover);
}

.nh-mode-option--plan .nh-mode-option__title {
  color: var(--nh-color-warning);
}

.nh-mode-option--build .nh-mode-option__title {
  color: var(--nh-color-success);
}

.nh-mode-option--plan.nh-mode-option--active {
  background: color-mix(in srgb, var(--nh-color-warning) 9%, transparent);
}

.nh-mode-option--build.nh-mode-option--active {
  background: color-mix(in srgb, var(--nh-color-success) 9%, transparent);
}
</style>
