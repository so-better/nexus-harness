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
    v-else-if="
      message.content ||
      message.references?.length ||
      displayToolCalls.length ||
      askUsers.length ||
      message.files?.length
    "
    class="nh-message"
    :class="[
      `nh-message--${message.role}`,
      { 'nh-message--grouped': grouped, 'nh-message--highlighted': highlighted }
    ]"
    :data-message-id="message.id"
  >
    <div class="nh-message__body" :class="{ 'nh-message__body--editing': editing }">
      <div
        v-if="
          message.content ||
          message.references?.length ||
          displayToolCalls.length ||
          askUsers.length ||
          message.files?.length
        "
        class="nh-message__bubble"
        :class="{
          'nh-message__bubble--tools':
            displayToolCalls.length > 0 || askUsers.some((ask) => ask.status === 'pending'),
          'nh-message__bubble--editing': editing
        }"
      >
        <template v-if="editing">
          <NInput
            ref="editInput"
            v-model:value="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            @keydown.esc.prevent="cancelEdit"
            @keydown.ctrl.enter.prevent="saveEdit"
            @keydown.meta.enter.prevent="saveEdit"
          />
          <div class="nh-message__edit-actions">
            <NButton size="small" @click="cancelEdit">{{ t('chat.askUserCancel') }}</NButton>
            <NButton size="small" type="primary" :disabled="!draft.trim()" @click="saveEdit">
              {{ t('app.send') }}
            </NButton>
          </div>
        </template>
        <template v-else>
          <AskUserCard
            v-for="ask in resolvedAsks"
            :key="ask.requestId"
            class="nh-message__ask nh-message__ask--first"
            embedded
            :ask="ask"
            @submit="(answers) => submitAsk(ask, answers)"
            @cancel="cancelAsk(ask)"
          />
          <UserMessageContent
            v-if="message.role === 'user' && (message.content || message.references?.length)"
            :content="message.content"
            :references="message.references"
          />
          <p v-else-if="message.content" class="nh-message__content">
            {{ contentText }}<span v-if="isTyping" class="nh-message__caret" />
          </p>
          <div
            v-if="message.files?.length"
            class="nh-message__files"
            :class="{ 'nh-message__files--after-content': Boolean(message.content) }"
          >
            <OutputFileCard v-for="file in message.files" :key="file.id" :file="file" />
          </div>

          <div
            v-if="displayToolCalls.length"
            class="nh-message__tools"
            :class="{ 'nh-message__tools--after-content': Boolean(message.content) }"
          >
            <div
              v-for="tool in displayToolCalls"
              :key="tool.id"
              class="nh-message__tool-entry"
              :data-tool-call-id="tool.id"
            >
              <ToolCallCard :tool="tool" flush @authorize-root="emit('request-root')" />
              <ApprovalCard
                v-for="approval in approvalForTool(tool)"
                :key="approval.id"
                inline
                :approval="approval"
                :tool="tool"
                :data-approval-id="approval.id"
                @approve="emit('approve', approval.id)"
                @reject="emit('reject', approval.id)"
              />
            </div>
          </div>

          <AskUserCard
            v-for="ask in otherAsks"
            :key="ask.requestId"
            class="nh-message__ask"
            embedded
            :ask="ask"
            @submit="(answers) => submitAsk(ask, answers)"
            @cancel="cancelAsk(ask)"
          />
        </template>
      </div>

      <div v-if="!editing" class="nh-message__actions">
        <NButton
          v-if="message.role === 'user'"
          text
          size="tiny"
          :disabled="actionsDisabled"
          @click="startEdit"
        >
          <template #icon>
            <AppIcon name="edit" :size="13" />
          </template>
          {{ t('chat.edit') }}
        </NButton>
        <NButton v-if="message.role === 'assistant'" text size="tiny" @click="copyMessage">
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
          @click="emit('regenerate-message')"
        >
          <template #icon>
            <AppIcon name="refresh" :size="13" />
          </template>
          {{ t('chat.regenerate') }}
        </NButton>
        <span class="nh-message__time">{{ timeLabel }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 单条消息：用户、助手或系统提示，并挂载工具调用卡片。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NInput, useMessage, type InputInst } from 'naive-ui';
import { t } from '@/app/i18n';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import type { ChatApproval, ChatAskUser, ChatMessageView, ChatToolCall } from '../types';
import AppIcon from '@/components/AppIcon.vue';
import ApprovalCard from './ApprovalCard.vue';
import AskUserCard from './AskUserCard.vue';
import OutputFileCard from './OutputFileCard.vue';
import ToolCallCard from './ToolCallCard.vue';
import UserMessageContent from './UserMessageContent.vue';
import { splitUserMessageReferences } from '../message-references';

const props = withDefaults(
  defineProps<{
    message: ChatMessageView;
    grouped?: boolean;
    highlighted?: boolean;
    askUsers?: ChatAskUser[];
    approvals?: ChatApproval[] | undefined;
    isLastAssistant?: boolean;
    actionsDisabled?: boolean;
  }>(),
  {
    grouped: false,
    highlighted: false,
    askUsers: () => [],
    approvals: () => [],
    isLastAssistant: false,
    actionsDisabled: false
  }
);

const emit = defineEmits<{
  'content-growth': [];
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'edit-message': [content: string, references?: MessageFileReference[]];
  'regenerate-message': [];
  'request-root': [];
}>();

const messageApi = useMessage();
const editing = ref(false);
const draft = ref('');
const editingReferences = ref<MessageFileReference[]>([]);
const editInput = ref<InputInst | null>(null);
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

/**
 * 回传当前提问的回答。
 */
const submitAsk = (ask: ChatAskUser, answers: AskUserAnswer[]): void => {
  emit('answer-user', ask.requestId, answers);
};

/**
 * 取消当前提问。
 */
const cancelAsk = (ask: ChatAskUser): void => {
  emit('answer-user', ask.requestId, undefined);
};

/**
 * 进入用户消息编辑态。
 */
const startEdit = async (): Promise<void> => {
  if (props.actionsDisabled || props.message.role !== 'user') return;
  const parts = splitUserMessageReferences(props.message.content);
  draft.value = props.message.references?.length ? props.message.content : parts.text;
  editingReferences.value = props.message.references?.length
    ? props.message.references
    : parts.references;
  editing.value = true;
  await nextTick();
  editInput.value?.focus();
};

/**
 * 提交编辑后的消息；父级会创建新的 Run。
 */
const saveEdit = (): void => {
  const content = draft.value.trim();
  if (!content) return;
  editing.value = false;
  emit(
    'edit-message',
    content,
    editingReferences.value.length ? editingReferences.value : undefined
  );
  editingReferences.value = [];
};

/**
 * 取消编辑并恢复原文。
 */
const cancelEdit = (): void => {
  editing.value = false;
  draft.value = '';
  editingReferences.value = [];
};

/**
 * 复制完整 Markdown 消息。
 */
const copyMessage = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    messageApi.success(t('chat.copied'));
  } catch {
    messageApi.error(t('chat.copyFailed'));
  }
};

const approvalForTool = (tool: ChatToolCall): ChatApproval[] =>
  props.approvals.filter(
    (approval) =>
      approval.id === tool.approvalId &&
      approval.toolCallId === tool.id &&
      approval.status === 'pending'
  );

const resolvedAsks = computed(() => props.askUsers.filter((ask) => ask.status === 'resolved'));
const otherAsks = computed(() => props.askUsers.filter((ask) => ask.status !== 'resolved'));

const displayToolCalls = computed(() =>
  props.message.toolCalls.filter((tool) => tool.name !== 'ask_user' && tool.name !== 'save_file')
);

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
  border-radius: 14px;
  transition: background var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-message--grouped {
  margin-top: -12px;
}

.nh-message--highlighted {
  background: color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--nh-color-accent) 5%, transparent);
}

.nh-message__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nh-message--user {
  justify-content: flex-end;
}

.nh-message--user .nh-message__body {
  max-width: 640px;
  flex: 0 1 auto;
  align-items: flex-end;
}

.nh-message--user .nh-message__body--editing {
  width: min(520px, 100%);
  max-width: 100%;
}

.nh-message__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-color-bg-elevated) 72%, transparent);
  --bubble-border: var(--nh-color-border);

  position: relative;
  width: fit-content;
  max-width: 100%;
  padding: 10px 13px;
  border: 1px solid var(--bubble-border);
  border-radius: 16px;
  background: var(--bubble-bg);
}

.nh-message--assistant .nh-message__bubble {
  border-top-left-radius: 0;
}

.nh-message--assistant .nh-message__bubble--tools {
  width: 100%;
}

.nh-message--user .nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-color-accent) 8%, var(--nh-color-bg-base));
  --bubble-border: color-mix(in srgb, var(--nh-color-accent) 12%, var(--nh-color-border));

  border-top-right-radius: 0;
  box-shadow: var(--nh-highlight);
}

.nh-message__bubble--editing {
  width: 100%;
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

.nh-message__files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nh-message__files--after-content {
  margin-top: 9px;
}

.nh-message__tools {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px -5px -4px;
}

.nh-message__tool-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nh-message__tools--after-content {
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid var(--nh-color-border);
}

.nh-message__ask {
  margin-top: 9px;
}

.nh-message__ask--first {
  margin-top: 0;
  margin-bottom: 9px;
}

.nh-message__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.nh-message--user .nh-message__actions {
  justify-content: flex-end;
}

.nh-message__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
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
