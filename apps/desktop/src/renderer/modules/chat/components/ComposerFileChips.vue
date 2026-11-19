<template>
  <div v-if="files.length" class="nh-file-chips" role="list" :aria-label="t('chat.filesSelected')">
    <NTooltip v-for="file in files" :key="file.path" placement="top" :show-arrow="false">
      <template #trigger>
        <NTag
          class="nh-file-chip"
          size="small"
          closable
          :bordered="false"
          role="listitem"
          @close="emit('remove', file.path)"
        >
          <template #icon>
            <AppIcon name="file" :size="12" />
          </template>
          <span class="nh-file-chip__name">{{ file.name }}</span>
        </NTag>
      </template>
      {{ rootName(file.root) }} / {{ file.relativePath }}
    </NTooltip>
  </div>
</template>

<script setup lang="ts">
/**
 * 已选文件引用：用文件图标与带后缀的文件名展示，完整路径放在悬浮提示中。
 */

import { NTooltip, NTag } from 'naive-ui';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ files: WorkspaceFileReference[] }>();
const emit = defineEmits<{ remove: [path: string] }>();

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
</script>

<style scoped lang="less">
.nh-file-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 2px 4px;
}

.nh-file-chip {
  max-width: 240px;
  border: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
}

.nh-file-chip__name {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
