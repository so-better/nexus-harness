<template>
  <div
    v-if="files.length || attachments.length"
    class="nh-file-chips"
    role="list"
    :aria-label="t('chat.filesSelected')"
  >
    <UserFileChip
      v-for="file in files"
      :key="file.path"
      :file="file"
      :session-id="sessionId"
      :is-image="file.isImage"
      :tooltip="`${rootName(file.root)} / ${file.relativePath}`"
      removable
      @remove="emit('remove', file.path)"
    />
    <AttachmentChip
      v-for="attachment in attachments"
      :key="attachment.id"
      :attachment="attachment"
      removable
      @remove="emit('remove-attachment', attachment)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 已选文件：@ 引用与附件共用一个 flex 布局，但使用不同 chip 语义和样式。
 */

import type { MessageAttachment } from '@shared/events';
import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AttachmentChip from './AttachmentChip.vue';
import UserFileChip from './UserFileChip.vue';

withDefaults(
  defineProps<{
    files: WorkspaceFileReference[];
    attachments?: MessageAttachment[];
    sessionId?: string | undefined;
  }>(),
  { attachments: () => [], sessionId: undefined }
);
const emit = defineEmits<{
  remove: [path: string];
  'remove-attachment': [attachment: MessageAttachment];
}>();

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
