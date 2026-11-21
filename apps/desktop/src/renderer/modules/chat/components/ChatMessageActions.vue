<template>
  <div class="nh-message__actions" :class="`nh-message__actions--${message.role}`">
    <NButton
      v-if="message.role === 'user'"
      text
      size="tiny"
      :disabled="actionsDisabled"
      @click="emit('edit')"
    >
      <template #icon>
        <AppIcon name="edit" :size="13" />
      </template>
      {{ t('chat.edit') }}
    </NButton>
    <NButton v-if="message.role === 'assistant'" text size="tiny" @click="copy">
      <template #icon>
        <AppIcon name="copy" :size="13" />
      </template>
      {{ t('chat.copy') }}
    </NButton>
    <NButton
      v-if="message.role === 'assistant' && isLastAssistant"
      text
      size="tiny"
      :disabled="actionsDisabled"
      @click="emit('regenerate')"
    >
      <template #icon>
        <AppIcon name="regenerate" :size="13" />
      </template>
      {{ t('chat.regenerate') }}
    </NButton>
    <PluginSlot
      v-if="message.role === 'assistant'"
      location="message.assistant.actions"
      :context="{
        location: 'message.assistant.actions',
        sessionId,
        messageId: message.id,
        runId: message.runId,
        role: 'assistant',
        usage: message.usage
      }"
    />
    <PluginSlot
      v-else-if="message.role === 'user'"
      location="message.user.actions"
      :context="{
        location: 'message.user.actions',
        sessionId,
        messageId: message.id,
        runId: message.runId,
        role: 'user'
      }"
    />
    <span class="nh-message__time">{{ timeLabel }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 消息操作栏：编辑、复制、重新生成与插件操作插槽。
 */

import { NButton, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import type { ChatMessageView } from '../types';
import AppIcon from '@/components/AppIcon.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';

const props = defineProps<{
  message: ChatMessageView;
  sessionId?: string | undefined;
  isLastAssistant: boolean;
  actionsDisabled: boolean;
  copyText: string;
  timeLabel: string;
}>();

const emit = defineEmits<{
  edit: [];
  regenerate: [];
}>();

const messageApi = useMessage();

/**
 * 复制完整 Markdown 消息。
 */
const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.copyText);
    messageApi.success(t('chat.copied'));
  } catch {
    messageApi.error(t('chat.copyFailed'));
  }
};
</script>

<style scoped lang="less">
.nh-message__actions {
  display: flex;
  min-height: 24px;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}

.nh-message__actions--assistant {
  justify-content: flex-start;
}

.nh-message__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-message__actions--assistant .nh-message__time {
  margin-left: auto;
}

.nh-message__actions--user {
  justify-content: flex-end;
}

.nh-message__actions :deep(.n-button) {
  font-size: 12px;
}
</style>
