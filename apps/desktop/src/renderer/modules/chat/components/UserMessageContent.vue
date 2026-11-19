<template>
  <div class="nh-user-message">
    <p v-if="parts.text" class="nh-user-message__text">{{ parts.text }}</p>
    <div v-if="parts.references.length" class="nh-user-message__references">
      <span
        v-for="file in parts.references"
        :key="file.path"
        class="nh-user-message__file"
        :title="file.path"
      >
        <AppIcon name="file" :size="12" />
        <span class="nh-user-message__name">{{ file.name }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 用户消息正文：将 @ 文件引用渲染为文件图标与带后缀的文件名。
 */

import { computed } from 'vue';
import type { MessageFileReference } from '@shared/events';
import AppIcon from '@/components/AppIcon.vue';
import { splitUserMessageReferences } from '../message-references';

const props = defineProps<{
  content: string;
  references?: MessageFileReference[] | undefined;
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
  gap: 6px;
}

.nh-user-message__file {
  display: inline-flex;
  max-width: 240px;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--nh-color-accent) 14%, var(--nh-color-border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--nh-color-bg-base) 72%, transparent);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-user-message__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
