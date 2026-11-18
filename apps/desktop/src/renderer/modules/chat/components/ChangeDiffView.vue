<template>
  <div class="nh-change-diff">
    <p v-if="diff.binary" class="nh-change-diff__empty">{{ t('change.binary') }}</p>
    <p v-else-if="diff.truncated" class="nh-change-diff__empty">{{ t('change.truncated') }}</p>
    <div v-else ref="scroller" class="nh-change-diff__scroll">
      <p v-if="limited" class="nh-change-diff__limited">{{ t('change.linesTruncated') }}</p>
      <div class="nh-change-diff__lines">
        <div
          v-for="line in lines"
          :key="line.key"
          class="nh-change-diff__line"
          :class="`nh-change-diff__line--${line.type}`"
        >
          <span class="nh-change-diff__sign">{{
            line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
          }}</span>
          <span class="nh-change-diff__text">{{ line.text || ' ' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 检查点行级 diff。
 */

import { computed, nextTick, ref, watch } from 'vue';
import type { CheckpointDiffResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { buildLineDiff } from '../diff';

const MAX_RENDER_LINES = 5000;
const props = defineProps<{ diff: CheckpointDiffResult }>();
const allLines = computed(() => buildLineDiff(props.diff.oldText, props.diff.newText));
const lines = computed(() => allLines.value.slice(0, MAX_RENDER_LINES));
const limited = computed(() => allLines.value.length > MAX_RENDER_LINES);
const scroller = ref<HTMLElement | null>(null);

/**
 * diff 打开后滚动到第一处变更，便于在复杂文件中快速定位。
 */
const revealFirstChange = async (): Promise<void> => {
  await nextTick();
  const scrollEl = scroller.value;
  const target = scrollEl?.querySelector<HTMLElement>(
    '.nh-change-diff__line--added, .nh-change-diff__line--removed'
  );
  if (scrollEl && target) {
    const containerRect = scrollEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scrollEl.scrollTop = Math.max(
      0,
      scrollEl.scrollTop + targetRect.top - containerRect.top - scrollEl.clientHeight / 3
    );
  }
};

watch(() => props.diff, revealFirstChange, { immediate: true });
</script>

<style scoped lang="less">
.nh-change-diff {
  height: 100%;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--nh-color-border);
  border-radius: 8px;
  background: var(--nh-color-bg-base);
}

.nh-change-diff__empty {
  margin: 0;
  padding: 16px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-change-diff__scroll {
  height: 100%;
  overflow: auto;
}

.nh-change-diff__limited {
  position: sticky;
  z-index: 1;
  top: 0;
  margin: 0;
  padding: 6px 10px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-change-diff__lines {
  min-width: max-content;
  padding: 6px 0;
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.65;
}

.nh-change-diff__line {
  display: flex;
  gap: 6px;
  padding: 0 8px;
  white-space: pre;
}

.nh-change-diff__line--added {
  background: color-mix(in srgb, var(--nh-color-success) 10%, transparent);
  color: var(--nh-color-success);
}

.nh-change-diff__line--removed {
  background: color-mix(in srgb, var(--nh-color-danger) 10%, transparent);
  color: var(--nh-color-danger);
}

.nh-change-diff__sign {
  flex: none;
  user-select: none;
}

.nh-change-diff__text {
  min-width: 0;
}
</style>
