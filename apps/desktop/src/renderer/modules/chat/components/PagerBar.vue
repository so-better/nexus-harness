<template>
  <div class="nh-pager">
    <button
      type="button"
      class="nh-pager__btn"
      :aria-label="t('chat.pagerPrevious')"
      :disabled="index === 0"
      @click="emit('prev')"
    >
      <AppIcon name="chevron-left" :size="14" />
    </button>
    <span class="nh-pager__count" aria-live="polite">{{ index + 1 }} / {{ total }}</span>
    <button
      type="button"
      class="nh-pager__btn"
      :aria-label="t('chat.pagerNext')"
      :disabled="index >= total - 1"
      @click="emit('next')"
    >
      <AppIcon name="chevron-right" :size="14" />
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 通用分页条：审批与 ask 共用，保证位置与样式一致。
 */

import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ index: number; total: number }>();

const emit = defineEmits<{ prev: []; next: [] }>();
</script>

<style scoped lang="less">
.nh-pager {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--nh-color-text-secondary);
}

.nh-pager__btn {
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  cursor: pointer;
  place-items: center;
  transition: color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-pager__btn:disabled {
  color: var(--nh-color-text-disabled);
  cursor: default;
}

.nh-pager__btn:hover:not(:disabled) {
  color: var(--nh-color-text-primary);
}

.nh-pager__count {
  min-width: 44px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
