<template>
  <section class="nh-change-section">
    <header class="nh-change-section__header">
      <div class="nh-change-section__title">
        <span class="nh-change-section__marker" />
        <span class="nh-change-section__run">{{ runLabel }}</span>
        <span class="nh-change-section__count">
          {{ section.groups.length }}
          {{ section.groups.length === 1 ? t('change.itemUnitOne') : t('change.itemUnitMany') }}
        </span>
        <NTag
          v-if="section.runId === latestRollbackRunId"
          size="tiny"
          :bordered="false"
          type="info"
        >
          {{ t('change.latest') }}
        </NTag>
      </div>
      <NPopconfirm
        v-if="section.runId && section.runId === latestRollbackRunId"
        @positive-click="emit('restore-run', section.runId)"
      >
        <template #trigger>
          <NButton text size="tiny" type="error" :loading="restoringRunId === section.runId">
            {{ t('change.restoreRun') }}
          </NButton>
        </template>
        {{ t('change.confirmRestoreRun') }}
      </NPopconfirm>
    </header>

    <ChangeFileRow
      v-for="group in section.groups"
      :key="group.key"
      :group="group"
      :active="selectedKey === group.key"
      :can-restore="!group.restored && group.runId === latestRollbackRunId"
      :restoring="restoringKey === group.key"
      @view="emit('view', $event)"
      @restore="emit('restore', $event)"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * 单个 Run 的变更分区。
 */

import { NButton, NPopconfirm, NTag } from 'naive-ui';
import { t } from '@/app/i18n';
import type { ChangeGroup, ChangeSection } from '../change-groups';
import ChangeFileRow from './ChangeFileRow.vue';

defineProps<{
  section: ChangeSection;
  runLabel: string;
  latestRollbackRunId?: string | undefined;
  selectedKey?: string | undefined;
  restoringKey?: string | undefined;
  restoringRunId?: string | undefined;
}>();

const emit = defineEmits<{
  'restore-run': [runId: string];
  view: [group: ChangeGroup];
  restore: [group: ChangeGroup];
}>();
</script>

<style scoped lang="less">
.nh-change-section {
  flex: none;
  border-top: 1px solid var(--nh-color-border);
}

.nh-change-section:first-child {
  border-top: 0;
}

.nh-change-section__header {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
}

.nh-change-section__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-change-section__marker {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--nh-color-accent);
}

.nh-change-section__run {
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  font-weight: 600;
}

.nh-change-section__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
  font-size: 10px;
  font-weight: 500;
}
</style>
