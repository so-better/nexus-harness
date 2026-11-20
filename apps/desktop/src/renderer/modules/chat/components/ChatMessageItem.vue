<template>
  <article v-if="message.role === 'system'" class="nh-message nh-message--system" :data-message-id="message.id"
    :class="{ 'nh-message--highlighted': highlighted }">
    <span class="nh-message__system-dot" />
    <span>{{ message.content }}</span>
  </article>
  <article v-else-if="
    message.content ||
    message.reasoning ||
    message.streaming ||
    timeline.length ||
    message.references?.length ||
    toolEntries.length ||
    askUsers.length ||
    message.files?.length ||
    orphanWorkspaceAuth
  " class="nh-message" :class="[
    `nh-message--${message.role}`,
    { 'nh-message--grouped': grouped, 'nh-message--highlighted': highlighted }
  ]" :data-message-id="message.id">
    <div class="nh-message__body" :class="{ 'nh-message__body--editing': editing }">
      <div v-if="
        message.content ||
        message.reasoning ||
        message.streaming ||
        timeline.length ||
        message.references?.length ||
        toolEntries.length ||
        askUsers.length ||
        message.files?.length ||
        orphanWorkspaceAuth
      " class="nh-message__bubble" :class="{
        'nh-message__bubble--tools':
          toolEntries.length > 0 || askUsers.some((ask) => ask.status === 'pending'),
        'nh-message__bubble--interruption': hasInterruption && !contentText && !timeline.length,
        'nh-message__bubble--editing': editing
      }">
        <template v-if="editing">
          <div v-if="editingReferences.length" class="nh-message__edit-files">
            <UserFileChip
              v-for="file in editingReferences"
              :key="file.path"
              :file="file"
              removable
              @remove="removeEditingReference(file.path)"
            />
          </div>
          <NPopover
            :show="(editSkillOpen && editSkillItems.length > 0) || editFileOpen"
            trigger="manual"
            placement="top-start"
            :show-arrow="false"
            :style="{ width: 'min(420px, calc(100vw - 48px))' }"
          >
            <template #trigger>
              <NInput
                ref="editInput"
                v-model:value="draft"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 6 }"
                @keydown="onEditKeydown"
                @blur="onEditBlur"
              />
            </template>
            <SkillPalette
              v-if="editSkillOpen && editSkillItems.length > 0"
              :items="editSkillItems"
              :active-index="editSkillActiveIndex"
              @select="chooseEditSkill"
              @hover="editSkillActiveIndex = $event"
            />
            <ComposerFileReference
              v-else-if="editFileOpen"
              :references="editFileCandidates"
              :active-index="editFileActiveIndex"
              :searching="editFileSearching"
              @select="selectEditFile"
            />
          </NPopover>
          <div class="nh-message__edit-actions">
            <NButton size="small" secondary @click="cancelEdit">{{
              t('chat.askUserCancel')
            }}</NButton>
            <NButton
              size="small"
              type="primary"
              secondary
              :disabled="!draft.trim() && !editingReferences.length"
              @click="saveEdit"
            >
              {{ t('app.send') }}
            </NButton>
          </div>
        </template>
        <template v-else-if="message.role === 'assistant'">
          <PluginSlot location="message.assistant.header" :context="{
            location: 'message.assistant.header',
            sessionId,
            messageId: message.id,
            runId: message.runId,
            role: 'assistant',
            usage: message.usage
          }" />

          <div class="nh-message__flow">
          <!-- 新消息走有序时间线；无 timeline 的历史消息走下方兜底渲染 -->
          <template v-if="timeline.length">
            <template v-for="segment in timeline" :key="segment.id">
              <ReasoningBlock
                v-if="segment.kind === 'reasoning'"
                :text="segment.text"
                :streaming="Boolean(segment.streaming)"
              />
              <MarkdownSegments
                v-else-if="segment.kind === 'content'"
                :content="segment.text"
                :streaming="Boolean(segment.streaming)"
              />
              <template v-else-if="segment.kind === 'tool'">
                <template v-for="tool in toolLookup(segment.toolCallId)" :key="tool.id">
                  <WorkspaceAuthCard
                    v-if="relatedWorkspaceAuth && relatedWorkspaceAuth.toolCallId === tool.id"
                    :data-workspace-auth-id="relatedWorkspaceAuth?.requestId"
                    :request="relatedWorkspaceAuth"
                    @allow="emit('allow-workspace')"
                    @reject="emit('reject-workspace')"
                  />
                  <ToolCallCard
                    v-if="!isToolInterruption(tool)"
                    :tool="tool"
                    :session-id="sessionId"
                    :message-id="message.id"
                    :run-id="message.runId"
                    @authorize-root="emit('request-root')"
                  />
                  <ApprovalCard
                    v-for="approval in approvalForTool(tool)"
                    :key="approval.id"
                    :approval="approval"
                    :tool="tool"
                    :session-id="sessionId"
                    :message-id="message.id"
                    :run-id="message.runId"
                    :data-approval-id="approval.id"
                    @approve="emit('approve', approval.id)"
                    @reject="emit('reject', approval.id)"
                  />
                </template>
              </template>
              <template v-else-if="segment.kind === 'ask'">
                <template v-for="ask in askLookup(segment.requestId)" :key="ask.requestId">
                  <AskUserCard
                    :ask="ask"
                    class="nh-message__ask"
                    embedded
                    @submit="(answers) => submitAsk(ask, answers)"
                    @cancel="cancelAsk(ask)"
                  />
                </template>
              </template>
              <template v-else-if="segment.kind === 'file'">
                <template v-for="file in fileLookup(segment.fileId)" :key="file.id">
                  <InlineMediaFile v-if="isInlineMediaFile(file)" :file="file" />
                  <OutputFileCard v-else :file="file" />
                </template>
              </template>
            </template>
          </template>

          <template v-else>
            <ReasoningBlock
              v-if="message.reasoning"
              :text="message.reasoning"
              :streaming="Boolean(message.streaming)"
            />
            <MarkdownSegments v-if="message.content" :content="contentText" :streaming="isTyping" />

            <div v-if="message.files?.length" class="nh-message__files"
              :class="{ 'nh-message__files--after-content': Boolean(message.content) }">
              <template v-for="file in message.files" :key="file.id">
                <InlineMediaFile v-if="isInlineMediaFile(file)" :file="file" />
                <OutputFileCard v-else :file="file" />
              </template>
            </div>

            <div v-if="toolEntries.length" class="nh-message__tools"
              :class="{ 'nh-message__tools--after-content': Boolean(message.content) }">
              <div v-for="entry in toolEntries" :key="entry.tool.id" class="nh-message__tool-entry"
                :data-tool-call-id="entry.tool.id"
                :data-workspace-auth-id="isWorkspaceAuthTool(entry.tool.id) ? relatedWorkspaceAuth?.requestId : undefined">
                <AskUserCard v-if="entry.kind === 'ask'" :ask="entry.ask" class="nh-message__ask" embedded
                  @submit="(answers) => submitAsk(entry.ask, answers)" @cancel="cancelAsk(entry.ask)" />
                <template v-else>
                  <WorkspaceAuthCard v-if="relatedWorkspaceAuth && relatedWorkspaceAuth.toolCallId === entry.tool.id"
                    :data-workspace-auth-id="relatedWorkspaceAuth?.requestId" :request="relatedWorkspaceAuth"
                    @allow="emit('allow-workspace')" @reject="emit('reject-workspace')" />
                  <ToolCallCard v-if="!isToolInterruption(entry.tool)" :tool="entry.tool" :session-id="sessionId"
                    :message-id="message.id" :run-id="message.runId" @authorize-root="emit('request-root')" />
                  <ApprovalCard v-for="approval in approvalForTool(entry.tool)" :key="approval.id" :approval="approval"
                    :tool="entry.tool" :session-id="sessionId" :message-id="message.id" :run-id="message.runId"
                    :data-approval-id="approval.id" @approve="emit('approve', approval.id)"
                    @reject="emit('reject', approval.id)" />
                </template>
              </div>
            </div>
          </template>

          <WorkspaceAuthCard v-if="orphanWorkspaceAuth" :data-workspace-auth-id="orphanWorkspaceAuth.requestId"
            :request="orphanWorkspaceAuth" @allow="emit('allow-workspace')" @reject="emit('reject-workspace')" />
          <AskUserCard v-for="ask in unmatchedAsks" :key="ask.requestId" class="nh-message__ask" embedded :ask="ask"
            @submit="(answers) => submitAsk(ask, answers)" @cancel="cancelAsk(ask)" />
          <ThinkingIndicator v-if="showThinking" />
          </div>
          <PluginSlot location="message.assistant.footer" :context="{
            location: 'message.assistant.footer',
            sessionId,
            messageId: message.id,
            runId: message.runId,
            role: 'assistant',
            usage: message.usage
          }" />
        </template>

        <template v-else>
          <UserMessageContent v-if="message.content || message.references?.length" :content="message.content"
            :references="message.references" />
          <PluginSlot location="message.user.footer" :context="{
            location: 'message.user.footer',
            sessionId,
            messageId: message.id,
            runId: message.runId,
            role: 'user'
          }" />
        </template>
      </div>

      <div v-if="!editing" class="nh-message__actions">
        <NButton v-if="message.role === 'user'" text size="tiny" :disabled="actionsDisabled" @click="startEdit">
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
        <NButton v-if="message.role === 'assistant' && isLastAssistant" text size="tiny" :disabled="actionsDisabled"
          @click="emit('regenerate-message')">
          <template #icon>
            <AppIcon name="regenerate" :size="13" />
          </template>
          {{ t('chat.regenerate') }}
        </NButton>
        <PluginSlot v-if="message.role === 'assistant'" location="message.assistant.actions" :context="{
          location: 'message.assistant.actions',
          sessionId,
          messageId: message.id,
          runId: message.runId,
          role: 'assistant',
          usage: message.usage
        }" />
        <PluginSlot v-else-if="message.role === 'user'" location="message.user.actions" :context="{
          location: 'message.user.actions',
          sessionId,
          messageId: message.id,
          runId: message.runId,
          role: 'user'
        }" />
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
import { NButton, NInput, NPopover, useMessage, type InputInst } from 'naive-ui';
import { t } from '@/app/i18n';
import type { AskUserAnswer } from '@shared/ask-user';
import type { MessageFileReference } from '@shared/events';
import type { ChatApproval, ChatAskUser, ChatMessageView, ChatToolCall } from '../types';
import type {
  OutputFile,
  WorkspaceAuthorizationRequest,
  WorkspaceFileReference
} from '@shared/ipc/contracts';
import AppIcon from '@/components/AppIcon.vue';
import ApprovalCard from './ApprovalCard.vue';
import AskUserCard from './AskUserCard.vue';
import OutputFileCard from './OutputFileCard.vue';
import InlineMediaFile from './InlineMediaFile.vue';
import ToolCallCard from './ToolCallCard.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import UserMessageContent from './UserMessageContent.vue';
import UserFileChip from './UserFileChip.vue';
import ThinkingIndicator from './ThinkingIndicator.vue';
import MarkdownSegments from '../render/MarkdownSegments.vue';
import ReasoningBlock from './ReasoningBlock.vue';
import WorkspaceAuthCard from './WorkspaceAuthCard.vue';
import ComposerFileReference from './ComposerFileReference.vue';
import SkillPalette from './SkillPalette.vue';
import { splitUserMessageReferences } from '../message-references';
import { useFileReference } from '../use-file-reference';
import { useSkillPalette } from '../use-skill-palette';
import { buildToolEntries, unmatchedAskUsers } from '../ask-tool-entries';
import { hasStreamingText, isAssistantTyping, shouldShowMessageThinking } from '../agent-generation';
import { isInlineMediaFile } from '../inline-media';

const props = withDefaults(
  defineProps<{
    message: ChatMessageView;
    grouped?: boolean;
    highlighted?: boolean;
    askUsers?: ChatAskUser[];
    approvals?: ChatApproval[] | undefined;
    sessionId?: string | undefined;
    isLastAssistant?: boolean;
    actionsDisabled?: boolean;
    workspaceAuth?: WorkspaceAuthorizationRequest | null;
    workspaceAuthToolExists?: boolean;
  }>(),
  {
    grouped: false,
    highlighted: false,
    askUsers: () => [],
    approvals: () => [],
    sessionId: undefined,
    isLastAssistant: false,
    actionsDisabled: false,
    workspaceAuth: null,
    workspaceAuthToolExists: false
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
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const messageApi = useMessage();
const editing = ref(false);
const draft = ref('');
const editingReferences = ref<MessageFileReference[]>([]);
const editInput = ref<InputInst | null>(null);
const visibleContent = ref(props.message.content);

/**
 * 编辑态新增文件引用，与输入区的 @ 选择保持一致。
 */
const addEditingReference = (reference: WorkspaceFileReference): void => {
  if (editingReferences.value.some((file) => file.path === reference.path)) return;
  editingReferences.value = [
    ...editingReferences.value,
    { path: reference.path, name: reference.name }
  ];
};

const editFileReference = useFileReference({
  draft,
  sessionId: computed(() => props.sessionId),
  disabled: computed(() => props.actionsDisabled),
  running: computed(() => props.actionsDisabled),
  enabled: computed(() => Boolean(props.sessionId)),
  inputRef: editInput,
  onSelect: addEditingReference,
  formatReference: () => '',
  submit: () => undefined,
  toggleMode: () => undefined
});
const editSkillPalette = useSkillPalette(draft, editInput);

const {
  references: editFileCandidates,
  activeIndex: editFileActiveIndex,
  searching: editFileSearching,
  open: editFileOpen,
  close: closeEditReferences,
  select: selectEditFile,
  onKeydown: onEditFileKeydown
} = editFileReference;
const {
  open: editSkillOpen,
  items: editSkillItems,
  activeIndex: editSkillActiveIndex,
  choose: chooseEditSkill,
  handleKeydown: handleEditSkillKeydown
} = editSkillPalette;

/**
 * 编辑态失焦时关闭 Skill 与 @ 候选，避免浮层残留。
 */
const onEditBlur = (): void => {
  closeEditReferences();
  editSkillOpen.value = false;
};

/**
 * 编辑态键盘：优先处理 Skill 与 @ 候选，保留 Cmd/Ctrl+Enter 保存与 Esc 取消。
 */
const onEditKeydown = (event: KeyboardEvent): void => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    saveEdit();
    return;
  }
  if (editSkillOpen.value && handleEditSkillKeydown(event)) return;
  if (editFileOpen.value) {
    onEditFileKeydown(event);
    if (event.defaultPrevented) return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
};
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
  if (!props.message.streaming || props.message.timeline?.length) {
    visibleContent.value = props.message.content;
    return;
  }
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
  const textarea = editInput.value?.textareaElRef;
  if (textarea) {
    const end = textarea.value.length;
    textarea.selectionStart = end;
    textarea.selectionEnd = end;
  }
};

/**
 * 提交编辑后的消息；父级会创建新的 Run。
 */
const saveEdit = (): void => {
  const content = draft.value.trim();
  if (!content && !editingReferences.value.length) return;
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
 * 编辑态移除一个文件引用。
 */
const removeEditingReference = (path: string): void => {
  editingReferences.value = editingReferences.value.filter((file) => file.path !== path);
};

/**
 * 复制完整 Markdown 消息。
 */
const copyMessage = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(copyText.value);
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


const toolEntries = computed(() => buildToolEntries(props.message.toolCalls, props.askUsers));
const unmatchedAsks = computed(() => {
  const matchedByTimeline = new Set(
    (props.message.timeline ?? []).flatMap((segment) =>
      segment.kind === 'ask' ? [segment.requestId] : []
    )
  );
  return unmatchedAskUsers(toolEntries.value, props.askUsers).filter(
    (ask) => !matchedByTimeline.has(ask.requestId)
  );
});

const timeline = computed(() => props.message.timeline ?? []);

/**
 * 复制时优先使用时间线里的正文段，避免与渲染顺序/拼接字段不一致。
 */
const copyText = computed(() => {
  const segments = props.message.timeline ?? [];
  if (!segments.length) return props.message.content;
  return segments
    .filter((segment) => segment.kind === 'content')
    .map((segment) => segment.text)
    .join('\n\n');
});

/**
 * 时间线渲染需要按 id 取回具体对象；返回数组便于模板内 v-for 做类型收窄。
 */
const toolLookup = (id: string): ChatToolCall[] => {
  const tool = props.message.toolCalls.find((item) => item.id === id);
  return tool ? [tool] : [];
};

const askLookup = (id: string): ChatAskUser[] => {
  const ask = props.askUsers.find((item) => item.requestId === id);
  return ask ? [ask] : [];
};

const fileLookup = (id: string): OutputFile[] => {
  const file = props.message.files?.find((item) => item.id === id);
  return file ? [file] : [];
};
const relatedWorkspaceAuth = computed<WorkspaceAuthorizationRequest | null>(() => {
  const request = props.workspaceAuth;
  return request && request.sessionId === props.sessionId ? request : null;
});

const isWorkspaceAuthTool = (toolId: string): boolean =>
  relatedWorkspaceAuth.value?.toolCallId === toolId;

/**
 * 审批或目录授权等待时隐藏工具调用行，只展示正在等待用户处理的确认卡。
 */
const isToolInterruption = (tool: ChatToolCall): boolean =>
  isWorkspaceAuthTool(tool.id) || approvalForTool(tool).length > 0;

/**
 * 工具调用尚未投影到界面时，授权卡仍必须可见，不能因为 ID 匹配失败而消失。
 */
const orphanWorkspaceAuth = computed<WorkspaceAuthorizationRequest | null>(() => {
  const request = relatedWorkspaceAuth.value;
  if (!request || !props.isLastAssistant || props.workspaceAuthToolExists) return null;
  return request;
});

/**
 * 需要用户确认时让消息气泡退场，把确认卡本身作为唯一焦点。
 */
const hasInterruption = computed(
  () =>
    Boolean(orphanWorkspaceAuth.value) ||
    toolEntries.value.some((entry) => entry.kind === 'tool' && isToolInterruption(entry.tool))
);
const hasPendingAsk = computed(() => props.askUsers.some((ask) => ask.status === 'pending'));

const contentText = computed(() =>
  props.message.role === 'assistant' ? visibleContent.value : props.message.content
);
const isTyping = computed(() =>
  isAssistantTyping({
    role: props.message.role,
    streaming: props.message.streaming === true,
    hasTimeline: Boolean(props.message.timeline?.length),
    visibleContent: visibleContent.value,
    content: props.message.content
  })
);
const showThinking = computed(() =>
  shouldShowMessageThinking({
    isTyping: isTyping.value,
    hasInterruption: hasInterruption.value,
    hasPendingAsk: hasPendingAsk.value,
    hasStreamingText: hasStreamingText(props.message, isTyping.value)
  })
);
watch(
  () => props.message.content,
  () => {
    if (props.message.role !== 'assistant' || !props.message.streaming) {
      visibleContent.value = props.message.content;
      return;
    }
    startPump();
  }
);

watch(
  () => props.message.streaming,
  (streaming) => {
    if (props.message.role !== 'assistant') return;
    if (!streaming) {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        frameId = undefined;
      }
      visibleContent.value = props.message.content;
      return;
    }
    startPump();
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

.nh-message__flow {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.nh-message__files {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.nh-message__files--after-content,
.nh-message__tools--after-content {
  margin-top: 15px;
}

.nh-message__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-message__tool-entry {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
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

.nh-message__actions {
  display: flex;
  min-height: 24px;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}

.nh-message--assistant .nh-message__actions {
  justify-content: flex-start;
}

.nh-message__time {
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}

.nh-message--assistant .nh-message__time {
  margin-left: auto;
}

.nh-message--user .nh-message__actions {
  justify-content: flex-end;
}

.nh-message__actions :deep(.n-button) {
  font-size: 12px;
}

.nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-surface-elevated) 72%, transparent);
  --bubble-border: var(--nh-border-subtle);

  position: relative;
  width: fit-content;
  max-width: 100%;
  padding: 10px 13px;
  border: 1px solid var(--bubble-border);
  border-radius: 16px;
  background: var(--bubble-bg);
}

.nh-message--assistant .nh-message__bubble {
  width: 100%;
  padding: 0;
  border-color: transparent;
  border-radius: 0;
  background: transparent;
}

.nh-message--assistant .nh-message__bubble--tools {
  width: 100%;
}

.nh-message--assistant .nh-message__bubble--interruption {
  width: 100%;
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.nh-message--user .nh-message__bubble {
  --bubble-bg: color-mix(in srgb, var(--nh-color-accent) 6%, var(--nh-surface-base));
  --bubble-border: color-mix(in srgb, var(--nh-color-accent) 14%, var(--nh-border-subtle));

  padding: 12px 16px;
  box-shadow: var(--nh-highlight);
}

.nh-message__bubble--editing {
  width: 100%;
}

.nh-message__edit-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.nh-message__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
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

.nh-message--system {
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: var(--nh-surface-elevated);
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
