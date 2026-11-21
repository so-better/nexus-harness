<template>
  <div class="nh-user-message">
    <p v-if="parts.text" class="nh-user-message__text">{{ parts.text }}</p>
    <div v-if="parts.references.length || attachments?.length" class="nh-user-message__references">
      <UserFileChip
        v-for="file in parts.references"
        :key="file.path"
        :file="file"
        :session-id="sessionId"
        :is-image="isImageFile(file.name)"
      />
      <AttachmentChip
        v-for="attachment in attachments"
        :key="attachment.id"
        :attachment="attachment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 用户消息正文：将 @ 文件引用渲染为文件图标与带后缀的文件名。
 */

import { computed } from 'vue';
import type { MessageAttachment, MessageFileReference } from '@shared/events';
import { isImageFile } from '@shared/files';
import { splitUserMessageReferences } from '../message-references';
import AttachmentChip from './AttachmentChip.vue';
import UserFileChip from './UserFileChip.vue';

const props = defineProps<{
  content: string;
  references?: MessageFileReference[] | undefined;
  attachments?: MessageAttachment[] | undefined;
  sessionId?: string | undefined;
}>();
const parts = computed(() => {
  if (props.references?.length) {
    return { text: props.content, references: props.references };
  }
  return splitUserMessageReferences(props.content);
});
</script>

<style scoped lang="less">
.nh-user-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-user-message__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.nh-user-message__references {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
