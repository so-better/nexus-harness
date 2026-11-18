<template>
  <NPopover trigger="click" placement="top-start" :show-arrow="false">
    <template #trigger>
      <NButton text size="small">
        <template #icon>
          <AppIcon name="folder" />
        </template>
        {{ rootLabel }}
      </NButton>
    </template>
    <div class="nh-roots">
      <div v-for="root in roots" :key="root.id" class="nh-roots__item" :title="root.path">
        <span class="nh-roots__copy">
          <span class="nh-roots__name">{{ rootName(root.path) }}</span>
          <span class="nh-roots__path">{{ root.path }}</span>
        </span>
        <NButton
          text
          size="tiny"
          :title="t('app.removeRoot')"
          :aria-label="t('app.removeRoot')"
          @click="emit('remove-root', root.id)"
        >
          <template #icon><AppIcon name="trash" :size="12" /></template>
        </NButton>
      </div>
      <NButton text size="small" class="nh-roots__add" @click="emit('choose-root')">
        <template #icon><AppIcon name="plus" :size="13" /></template>
        {{ t('app.chooseRoot') }}
      </NButton>
    </div>
  </NPopover>
</template>

<script setup lang="ts">
/**
 * 工作区 root 选择与移除。
 */

import { NButton, NPopover } from 'naive-ui';
import type { SessionRoot } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ rootLabel: string; roots: SessionRoot[] }>();
const emit = defineEmits<{ 'choose-root': []; 'remove-root': [rootId: string] }>();

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
</script>

<style scoped lang="less">
.nh-roots {
  display: flex;
  width: 320px;
  flex-direction: column;
  gap: 2px;
}

.nh-roots__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
}

.nh-roots__item:hover {
  background: var(--nh-color-bg-hover);
}

.nh-roots__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.nh-roots__name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-roots__path {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-roots__add {
  align-self: flex-start;
  margin-top: 2px;
}
</style>
