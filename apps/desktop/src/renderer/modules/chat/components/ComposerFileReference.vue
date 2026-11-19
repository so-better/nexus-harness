<template>
  <div class="nh-references" role="listbox" :aria-label="t('chat.fileReferenceTitle')">
    <div class="nh-references__header">
      <span>{{ t('chat.fileReferenceTitle') }}</span>
      <span v-if="searching" class="nh-references__hint">
        {{ t('chat.fileReferenceSearching') }}
      </span>
    </div>
    <div v-if="!searching && !references.length" class="nh-references__empty">
      {{ t('chat.fileReferenceEmpty') }}
    </div>
    <button
      v-for="(reference, index) in references"
      :key="reference.path"
      type="button"
      class="nh-reference"
      :class="{ 'nh-reference--active': index === activeIndex }"
      role="option"
      :aria-selected="index === activeIndex"
      @mousedown.prevent="emit('select', reference)"
    >
      <AppIcon name="file" :size="13" />
      <span class="nh-reference__name">{{ reference.name }}</span>
      <span class="nh-reference__path">
        {{ rootName(reference.root) }} · {{ reference.relativePath }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @ 文件引用候选列表。
 */

import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{
  references: WorkspaceFileReference[];
  activeIndex: number;
  searching: boolean;
}>();

const emit = defineEmits<{ select: [reference: WorkspaceFileReference] }>();

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
</script>

<style scoped lang="less">
.nh-references {
  display: flex;
  max-height: 220px;
  flex-direction: column;
  gap: 1px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-surface-elevated);
  box-shadow: var(--nh-shadow-card);
}

.nh-references__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 7px 5px;
  color: var(--nh-color-text-secondary);
  font-size: 10px;
}

.nh-references__hint,
.nh-references__empty {
  color: var(--nh-color-text-disabled);
  font-size: 10px;
}

.nh-references__empty {
  padding: 8px;
}

.nh-reference {
  display: flex;
  min-height: 28px;
  align-items: center;
  gap: 7px;
  padding: 4px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nh-reference:hover,
.nh-reference--active {
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-primary);
}

.nh-reference__name {
  flex: none;
  font-size: 12px;
}

.nh-reference__path {
  min-width: 0;
  overflow: hidden;
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
