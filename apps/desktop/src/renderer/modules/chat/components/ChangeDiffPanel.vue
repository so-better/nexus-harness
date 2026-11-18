<template>
  <section class="nh-changes__diff">
    <div class="nh-changes__diff-header">
      <span class="nh-changes__diff-path">{{ group.path }}</span>
      <NButton v-if="diff" size="tiny" secondary @click="emit('open', diff.checkpointId)">
        {{ t('change.openFile') }}
      </NButton>
    </div>
    <p v-if="error" class="nh-changes__error">{{ error }}</p>
    <p v-else-if="loading" class="nh-changes__empty">{{ t('change.loading') }}</p>
    <ChangeDiffView v-else-if="diff" :diff="diff" />
  </section>
</template>

<script setup lang="ts">
/**
 * 变更 diff 区域。
 */

import { NButton } from 'naive-ui';
import type { CheckpointDiffResult } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import type { ChangeGroup } from '../change-groups';
import ChangeDiffView from './ChangeDiffView.vue';

defineProps<{
  group: ChangeGroup;
  diff?: CheckpointDiffResult | undefined;
  loading: boolean;
  error?: string | undefined;
}>();

const emit = defineEmits<{ open: [checkpointId: string] }>();
</script>

<style scoped lang="less">
.nh-changes__diff {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--nh-color-border);
}

.nh-changes__diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.nh-changes__diff-path {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-changes__empty,
.nh-changes__error {
  margin: 3px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-changes__error {
  color: var(--nh-color-danger);
}
</style>
