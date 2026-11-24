<template>
  <div
    ref="listRef"
    class="nh-references"
    role="listbox"
    :aria-label="t('chat.fileReferenceTitle')"
  >
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
      <span class="nh-reference__icon">
        <AppIcon :name="reference.isImage ? 'image' : 'file'" :size="14" />
      </span>
      <span class="nh-reference__copy">
        <span class="nh-reference__name">{{ reference.name }}</span>
        <span class="nh-reference__path">
          {{ rootName(reference.root) }} · {{ reference.relativePath }}
        </span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * @ 文件引用候选列表。
 */

import { nextTick, ref, watch } from 'vue';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  references: WorkspaceFileReference[];
  activeIndex: number;
  searching: boolean;
}>();

const emit = defineEmits<{ select: [reference: WorkspaceFileReference] }>();
const listRef = ref<HTMLElement | null>(null);

// 键盘上下移动时保持选中项在列表可视范围内
watch(
  () => props.activeIndex,
  async () => {
    await nextTick();
    const buttons = listRef.value?.querySelectorAll<HTMLElement>('.nh-reference');
    buttons?.[props.activeIndex]?.scrollIntoView({ block: 'nearest' });
  }
);

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
</script>

<style scoped lang="less">
.nh-references {
  display: flex;
  max-height: 280px;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px;
}

.nh-references__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 7px 6px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-references__hint,
.nh-references__empty {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

.nh-references__empty {
  padding: 8px;
}

.nh-reference {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--nh-color-text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-reference:hover {
  background: var(--nh-surface-hover);
}

.nh-reference--active,
.nh-reference--active:hover {
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
}

.nh-reference__icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-surface-hover);
  color: var(--nh-color-text-secondary);
}

.nh-reference--active .nh-reference__icon {
  background: color-mix(in srgb, var(--nh-color-accent) 14%, transparent);
  color: var(--nh-color-accent);
}

.nh-reference__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.nh-reference__name {
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-reference__path {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
