<template>
  <article
    v-if="message.role === 'system'"
    class="nh-message nh-message--system"
    :data-message-id="message.id"
    :class="{ 'nh-message--highlighted': highlighted }"
  >
    <span class="nh-message__system-dot" />
    <span>{{ message.content }}</span>
  </article>
  <article
    v-else
    class="nh-message"
    :class="[
      `nh-message--${message.role}`,
      { 'nh-message--grouped': grouped, 'nh-message--highlighted': highlighted }
    ]"
    :data-message-id="message.id"
  >
    <NAvatar
      v-if="message.role === 'assistant' && !grouped"
      round
      :size="24"
      :style="assistantAvatarStyle"
    >
      N
    </NAvatar>
    <div class="nh-message__body">
      <header v-if="!grouped" class="nh-message__header">
        <span class="nh-message__role">{{ roleLabel }}</span>
        <span class="nh-message__time">{{ timeLabel }}</span>
      </header>
      <p v-if="message.content" class="nh-message__content">
        {{ contentText }}<span v-if="isTyping" class="nh-message__caret" />
      </p>
      <div v-if="message.toolCalls.length" class="nh-message__tools">
        <ToolCallCard v-for="tool in message.toolCalls" :key="tool.id" :tool="tool" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 单条消息：用户、助手或系统提示，并挂载工具调用卡片。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NAvatar } from 'naive-ui';
import { t } from '@/app/i18n';
import type { ChatMessageView } from '../types';
import ToolCallCard from './ToolCallCard.vue';

const props = withDefaults(
  defineProps<{
    message: ChatMessageView;
    grouped?: boolean;
    highlighted?: boolean;
  }>(),
  { grouped: false, highlighted: false }
);

const emit = defineEmits<{ 'content-growth': [] }>();

const visibleContent = ref(props.message.content);
let frameId: number | undefined;

/**
 * 流式文本逐帧追平目标内容；完成时仍把剩余尾巴打完，避免整段突然跳出。
 */
const pump = (): void => {
  frameId = undefined;
  if (props.message.role !== 'assistant') {
    visibleContent.value = props.message.content;
    return;
  }

  const target = Array.from(props.message.content);
  const visible = Array.from(visibleContent.value);
  if (visible.length >= target.length) {
    if (visibleContent.value !== props.message.content)
      visibleContent.value = props.message.content;
    return;
  }

  const remaining = target.length - visible.length;
  const step = Math.max(1, Math.ceil(remaining / 16));
  visibleContent.value = target.slice(0, visible.length + step).join('');
  emit('content-growth');
  frameId = requestAnimationFrame(pump);
};

/**
 * 启动追逐帧；已有帧时不重复调度。
 */
const startPump = (): void => {
  if (frameId === undefined) frameId = requestAnimationFrame(pump);
};

const contentText = computed(() =>
  props.message.role === 'assistant' ? visibleContent.value : props.message.content
);
const isTyping = computed(
  () =>
    props.message.role === 'assistant' &&
    (props.message.streaming === true || visibleContent.value !== props.message.content)
);

watch(
  () => props.message.content,
  () => {
    if (props.message.role !== 'assistant') {
      visibleContent.value = props.message.content;
      return;
    }
    startPump();
  }
);

watch(
  () => props.message.streaming,
  () => {
    if (props.message.role === 'assistant') startPump();
  }
);

onMounted(() => {
  if (props.message.role === 'assistant') startPump();
});

onBeforeUnmount(() => {
  if (frameId !== undefined) cancelAnimationFrame(frameId);
});

const roleLabel = computed(() => {
  if (props.message.role === 'user') return t('chat.user');
  if (props.message.role === 'assistant') return t('chat.assistant');
  return t('chat.system');
});

const assistantAvatarStyle = {
  background: 'color-mix(in srgb, var(--nh-color-accent) 12%, transparent)',
  color: 'var(--nh-color-accent)',
  fontSize: '12px',
  fontWeight: '600'
};

const timeLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(props.message.createdAt)
);
</script>

<style scoped lang="less">
.nh-message {
  display: flex;
  scroll-margin: 24px;
  gap: 12px;
  align-items: flex-start;
  border-radius: 12px;
  transition: background var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-message--highlighted {
  background: color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--nh-color-accent) 5%, transparent);
}

.nh-message--grouped {
  margin-top: -12px;
}

.nh-message__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nh-message--grouped .nh-message__body {
  padding-left: 36px;
}

.nh-message--user {
  justify-content: flex-end;
}

.nh-message--user .nh-message__body {
  max-width: 640px;
  flex: 0 1 auto;
  align-items: flex-end;
}

.nh-message__header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.nh-message--user .nh-message__header {
  justify-content: flex-end;
}

.nh-message__role {
  font-size: 12px;
  font-weight: 600;
}

.nh-message--user .nh-message__role {
  color: var(--nh-color-accent);
}

.nh-message__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-message__content {
  max-width: 100%;
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.nh-message__caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--nh-color-accent);
  vertical-align: -0.12em;
  animation: caret-blink 1s steps(2, start) infinite;
}

@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

.nh-message--user .nh-message__content {
  width: fit-content;
  padding: 10px 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: 14px;
  border-bottom-right-radius: 4px;
  background: color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-base));
  box-shadow: var(--nh-highlight);
}

.nh-message__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2px;
}

.nh-message--system {
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.nh-message__system-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nh-color-warning);
}
</style>
