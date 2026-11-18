<template>
  <div
    class="nh-change"
    :class="{ 'nh-change--active': active, 'nh-change--restored': group.restored }"
  >
    <button type="button" class="nh-change__main" @click="emit('view', group)">
      <span class="nh-change__icon">
        <AppIcon name="file" :size="14" />
      </span>
      <span class="nh-change__copy">
        <span class="nh-change__name">{{ baseName(group.path) }}</span>
        <span class="nh-change__path">{{ group.path }}</span>
      </span>
      <span
        class="nh-change__kind"
        :class="`nh-change__kind--${group.restored ? 'restored' : group.kind}`"
      >
        <span class="nh-change__kind-dot" />
        {{ group.restored ? t('change.restored') : kindLabel(group.kind) }}
      </span>
    </button>
    <div class="nh-change__actions">
      <span class="nh-change__time">{{ formatTime(group.latestAt) }}</span>
      <NButton text size="tiny" type="primary" @click="emit('view', group)">
        {{ t('change.viewDiff') }}
      </NButton>
      <NPopconfirm v-if="canRestore" @positive-click="emit('restore', group)">
        <template #trigger>
          <NButton text size="tiny" type="error" :loading="restoring">
            {{ t('change.restore') }}
          </NButton>
        </template>
        {{ t('change.confirmRestore') }}
      </NPopconfirm>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 单个文件的变更行。
 */

import { NButton, NPopconfirm } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import type { ChangeGroup, ChangeKind } from '../change-groups';

defineProps<{
  group: ChangeGroup;
  active: boolean;
  canRestore: boolean;
  restoring: boolean;
}>();

const emit = defineEmits<{
  view: [group: ChangeGroup];
  restore: [group: ChangeGroup];
}>();

const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const formatTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
const kindLabel = (kind: ChangeKind): string => t(`change.kind.${kind}`);
</script>

<style scoped lang="less">
.nh-change {
  padding: 10px 16px;
  border-top: 1px solid color-mix(in srgb, var(--nh-color-border) 72%, transparent);
  background: transparent;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-change:first-of-type {
  border-top: 0;
}

.nh-change:hover {
  background: var(--nh-color-bg-hover);
}

.nh-change--active {
  background: color-mix(in srgb, var(--nh-color-accent) 13%, var(--nh-color-bg-elevated));
}

.nh-change--active:hover {
  background: color-mix(in srgb, var(--nh-color-accent) 16%, var(--nh-color-bg-elevated));
}

.nh-change--restored {
  opacity: 0.65;
}

.nh-change__main {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nh-change__icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  border-radius: 7px;
  background: var(--nh-color-bg-base);
  color: var(--nh-color-text-secondary);
}

.nh-change__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.nh-change__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-change__path {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-change__kind {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--nh-color-text-secondary);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.nh-change__kind-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
}

.nh-change__kind--created {
  color: var(--nh-color-success);
}

.nh-change__kind--modified {
  color: var(--nh-color-accent);
}

.nh-change__kind--deleted {
  color: var(--nh-color-danger);
}

.nh-change__kind--restored {
  color: var(--nh-color-text-disabled);
}

.nh-change__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-left: 34px;
}

.nh-change__time {
  margin-right: auto;
  color: var(--nh-color-text-disabled);
  font-size: 10px;
}
</style>
