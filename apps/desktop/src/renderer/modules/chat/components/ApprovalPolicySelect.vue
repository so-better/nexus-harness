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
        class="nh-approval-select"
        :class="`nh-approval-select--${approvalPolicy}`"
        aria-haspopup="menu"
        :title="activeHint"
        :aria-label="`${t('approval.label')}: ${activeLabel}`"
        :disabled="disabled"
      >
        <span class="nh-approval-select__dot" />
        <span>{{ activeLabel }}</span>
        <AppIcon name="chevron-down" :size="12" />
      </button>
    </template>

    <div class="nh-approval-menu" role="menu">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="menuitemradio"
        class="nh-approval-option"
        :class="[
          `nh-approval-option--${option.value}`,
          { 'nh-approval-option--active': approvalPolicy === option.value }
        ]"
        :disabled="option.value === 'workspace' && !hasWorkspace"
        :aria-checked="approvalPolicy === option.value"
        @click="choose(option.value)"
      >
        <span class="nh-approval-option__title">
          <span class="nh-approval-option__dot" />
          {{ option.label }}
        </span>
        <span class="nh-approval-option__description">{{ option.description }}</span>
      </button>
    </div>
  </NPopover>
</template>

<script setup lang="ts">
/**
 * 会话审批策略选择：逐次审批、工作区信任与始终信任。
 */

import { computed, ref } from 'vue';
import { NPopover } from 'naive-ui';
import type { ApprovalPolicy } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  approvalPolicy: ApprovalPolicy;
  disabled: boolean;
  hasWorkspace: boolean;
}>();

const emit = defineEmits<{ 'update-approval-policy': [policy: ApprovalPolicy] }>();
const open = ref(false);

const activeLabel = computed(() => t(`approval.${props.approvalPolicy}`));
const activeHint = computed(() => t(`approval.${props.approvalPolicy}Hint`));

const options = computed<Array<{ value: ApprovalPolicy; label: string; description: string }>>(
  () => [
    {
      value: 'ask',
      label: t('approval.ask'),
      description: t('approval.askDesc')
    },
    {
      value: 'workspace',
      label: t('approval.workspace'),
      description: t('approval.workspaceDesc')
    },
    {
      value: 'always',
      label: t('approval.always'),
      description: t('approval.alwaysDesc')
    }
  ]
);

const choose = (value: ApprovalPolicy): void => {
  open.value = false;
  if (value !== props.approvalPolicy) emit('update-approval-policy', value);
};
</script>

<style scoped lang="less">
.nh-approval-select {
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

.nh-approval-select:disabled {
  cursor: default;
  opacity: 0.55;
}

.nh-approval-select:hover:not(:disabled) {
  background: var(--nh-color-bg-hover);
}

.nh-approval-select--workspace {
  color: var(--nh-color-accent);
}

.nh-approval-select--always {
  color: var(--nh-color-warning);
}

.nh-approval-select__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}

.nh-approval-menu {
  display: flex;
  width: 310px;
  flex-direction: column;
  gap: 2px;
}

.nh-approval-option {
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

.nh-approval-option:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.nh-approval-option__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}

.nh-approval-option__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}

.nh-approval-option__description {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-approval-option:hover:not(:disabled) {
  background: var(--nh-color-bg-hover);
}

.nh-approval-option--workspace .nh-approval-option__title {
  color: var(--nh-color-accent);
}

.nh-approval-option--always .nh-approval-option__title {
  color: var(--nh-color-warning);
}

.nh-approval-option--workspace.nh-approval-option--active {
  background: color-mix(in srgb, var(--nh-color-accent) 9%, transparent);
}

.nh-approval-option--always.nh-approval-option--active {
  background: color-mix(in srgb, var(--nh-color-warning) 9%, transparent);
}
</style>
