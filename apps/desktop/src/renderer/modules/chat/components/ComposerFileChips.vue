<template>
  <div v-if="files.length" class="nh-file-chips" role="list" :aria-label="t('chat.filesSelected')">
    <UserFileChip
      v-for="file in files"
      :key="file.path"
      :file="file"
      :tooltip="`${rootName(file.root)} / ${file.relativePath}`"
      removable
      role="listitem"
      @remove="emit('remove', file.path)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 已选文件引用：与用户消息共用同一套文件 chip。
 */

import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import UserFileChip from './UserFileChip.vue';

defineProps<{ files: WorkspaceFileReference[] }>();
const emit = defineEmits<{ remove: [path: string] }>();

const rootName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
</script>

<style scoped lang="less">
.nh-file-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 2px 4px;
}
</style>
