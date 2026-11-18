<template>
  <aside class="nh-changes" :class="{ 'nh-changes--has-diff': selectedGroup }">
    <header class="nh-changes__header">
      <div>
        <h2 class="nh-changes__title">{{ t('change.title') }}</h2>
        <p class="nh-changes__hint">{{ t('change.hint') }}</p>
      </div>
      <NButton text size="tiny" :aria-label="t('change.close')" @click="emit('close')">
        <template #icon>
          <AppIcon name="close" :size="14" />
        </template>
      </NButton>
    </header>

    <div v-if="!groups.length" class="nh-changes__empty">{{ t('change.empty') }}</div>

    <template v-else>
      <div class="nh-changes__toolbar">
        <span>{{ groups.length }} {{ changeUnitLabel }}</span>
        <span class="nh-changes__latest-hint">{{ t('change.latestOnlyHint') }}</span>
      </div>

      <div class="nh-changes__list">
        <ChangeRunSection
          v-for="section in sections"
          :key="section.key"
          :section="section"
          :run-label="runLabel(section.runId)"
          :latest-rollback-run-id="latestRollbackRunId"
          :selected-key="selectedKey"
          :restoring-key="restoringKey"
          :restoring-run-id="restoringRunId"
          @restore-run="restoreRun"
          @view="selectGroup"
          @restore="restoreGroup"
        />
      </div>

      <ChangeDiffPanel
        v-if="selectedGroup"
        :group="selectedGroup"
        :diff="diff"
        :loading="diffLoading"
        :error="diffError"
        @open="emit('open-file', $event)"
      />
    </template>
  </aside>
</template>

<script setup lang="ts">
/**
 * 变更审阅检查器：列表、Run 分组、diff 与回滚。
 */

import { toRef } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChatChange } from '../types';
import { useChangeReview } from '../use-change-review';
import ChangeDiffPanel from './ChangeDiffPanel.vue';
import ChangeRunSection from './ChangeRunSection.vue';

const props = defineProps<{ changes: ChatChange[]; sessionId?: string | undefined }>();
const emit = defineEmits<{
  close: [];
  restored: [];
  'open-file': [checkpointId: string];
}>();

const {
  selectedKey,
  diff,
  diffLoading,
  diffError,
  restoringKey,
  restoringRunId,
  groups,
  sections,
  selectedGroup,
  changeUnitLabel,
  latestRollbackRunId,
  runLabel,
  selectGroup,
  restoreGroup,
  restoreRun
} = useChangeReview(toRef(props, 'changes'), toRef(props, 'sessionId'));
</script>

<style scoped lang="less">
.nh-changes {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-left: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-base);
}

.nh-changes__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 16px 10px;
}

.nh-changes__title {
  margin: 0;
  font-size: 14px;
}

.nh-changes__hint,
.nh-changes__empty {
  margin: 3px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-changes__empty {
  padding: 20px 16px;
}

.nh-changes__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-changes__latest-hint {
  overflow: hidden;
  color: var(--nh-color-text-disabled);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-changes__list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: auto;
}

.nh-changes--has-diff .nh-changes__list {
  max-height: 42%;
  flex: 0 1 42%;
}
</style>
