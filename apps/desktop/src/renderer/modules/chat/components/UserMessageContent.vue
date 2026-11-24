<template>
  <div class="nh-user-message">
    <p v-if="skill || parts.text" class="nh-user-message__text">
      <SkillTag v-if="skill" :id="skill.id" /><span
        v-if="displayText"
        class="nh-user-message__prompt"
        >{{ displayText }}</span
      >
    </p>
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
import { parseExplicitSkill } from '@shared/skills';
import { isImageFile } from '@shared/files';
import SkillTag from './SkillTag.vue';
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

/**
 * 显式 Skill 调用：与主进程使用相同的前缀规则，展示 /skill-id 标签。
 */
const skill = computed(() => parseExplicitSkill(parts.value.text));

const displayText = computed(() => skill.value?.prompt ?? parts.value.text);
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

.nh-user-message__text :deep(.nh-skill-tag) {
  margin-right: 6px;
  vertical-align: middle;
}

.nh-user-message__references {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
