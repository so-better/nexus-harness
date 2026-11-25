<template>
  <PluginSlot
    location="message.assistant.header"
    :context="{
      location: 'message.assistant.header',
      sessionId,
      messageId: message.id,
      runId: message.runId,
      role: 'assistant',
      usage: message.usage
    }"
  />

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
              :workspace-auth="nestedWorkspaceAuth(tool)"
              @authorize-root="emit('request-root')"
              @approve="(approvalId) => emit('approve', approvalId)"
              @reject="(approvalId) => emit('reject', approvalId)"
              @allow-workspace="emit('allow-workspace')"
              @reject-workspace="emit('reject-workspace')"
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
              @submit="(answers) => emit('answer-user', ask.requestId, answers)"
              @cancel="emit('answer-user', ask.requestId, undefined)"
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

      <div
        v-if="message.files?.length"
        class="nh-message__files"
        :class="{ 'nh-message__files--after-content': Boolean(message.content) }"
      >
        <template v-for="file in message.files" :key="file.id">
          <InlineMediaFile v-if="isInlineMediaFile(file)" :file="file" />
          <OutputFileCard v-else :file="file" />
        </template>
      </div>

      <div
        v-if="toolEntries.length"
        class="nh-message__tools"
        :class="{ 'nh-message__tools--after-content': Boolean(message.content) }"
      >
        <div
          v-for="entry in toolEntries"
          :key="entry.tool.id"
          class="nh-message__tool-entry"
          :data-tool-call-id="entry.tool.id"
          :data-workspace-auth-id="
            isWorkspaceAuthTool(entry.tool.id) ? relatedWorkspaceAuth?.requestId : undefined
          "
        >
          <AskUserCard
            v-if="entry.kind === 'ask'"
            :ask="entry.ask"
            class="nh-message__ask"
            embedded
            @submit="(answers) => emit('answer-user', entry.ask.requestId, answers)"
            @cancel="emit('answer-user', entry.ask.requestId, undefined)"
          />
          <template v-else>
            <WorkspaceAuthCard
              v-if="relatedWorkspaceAuth && relatedWorkspaceAuth.toolCallId === entry.tool.id"
              :data-workspace-auth-id="relatedWorkspaceAuth?.requestId"
              :request="relatedWorkspaceAuth"
              @allow="emit('allow-workspace')"
              @reject="emit('reject-workspace')"
            />
            <ToolCallCard
              v-if="!isToolInterruption(entry.tool)"
              :tool="entry.tool"
              :session-id="sessionId"
              :message-id="message.id"
              :run-id="message.runId"
              :workspace-auth="nestedWorkspaceAuth(entry.tool)"
              @authorize-root="emit('request-root')"
              @approve="(approvalId) => emit('approve', approvalId)"
              @reject="(approvalId) => emit('reject', approvalId)"
              @allow-workspace="emit('allow-workspace')"
              @reject-workspace="emit('reject-workspace')"
            />
            <ApprovalCard
              v-for="approval in approvalForTool(entry.tool)"
              :key="approval.id"
              :approval="approval"
              :tool="entry.tool"
              :session-id="sessionId"
              :message-id="message.id"
              :run-id="message.runId"
              :data-approval-id="approval.id"
              @approve="emit('approve', approval.id)"
              @reject="emit('reject', approval.id)"
            />
          </template>
        </div>
      </div>
    </template>

    <WorkspaceAuthCard
      v-if="orphanWorkspaceAuth"
      :data-workspace-auth-id="orphanWorkspaceAuth.requestId"
      :request="orphanWorkspaceAuth"
      @allow="emit('allow-workspace')"
      @reject="emit('reject-workspace')"
    />
    <AskUserCard
      v-for="ask in unmatchedAsks"
      :key="ask.requestId"
      class="nh-message__ask"
      embedded
      :ask="ask"
      @submit="(answers) => emit('answer-user', ask.requestId, answers)"
      @cancel="emit('answer-user', ask.requestId, undefined)"
    />
    <ThinkingIndicator v-if="showThinking" />
  </div>
  <PluginSlot
    location="message.assistant.footer"
    :context="{
      location: 'message.assistant.footer',
      sessionId,
      messageId: message.id,
      runId: message.runId,
      role: 'assistant',
      usage: message.usage
    }"
  />
</template>

<script setup lang="ts">
/**
 * 助手消息内容：时间线、工具调用、提问、文件与目录授权。
 */

import type { AskUserAnswer } from '@shared/ask-user';
import type {
  ChatApproval,
  ChatAskUser,
  ChatMessageView,
  ChatTimelineSegment,
  ChatToolCall
} from '../types';
import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import type { ToolEntry } from '../ask-tool-entries';
import { isInlineMediaFile } from '../inline-media';
import {
  approvalForTool as getApprovalForTool,
  askLookup as getAskLookup,
  fileLookup as getFileLookup,
  isToolInterruption as getIsToolInterruption,
  isWorkspaceAuthTool as getIsWorkspaceAuthTool,
  toolLookup as getToolLookup
} from '../message-flow-lookups';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import ApprovalCard from './ApprovalCard.vue';
import AskUserCard from './AskUserCard.vue';
import OutputFileCard from './OutputFileCard.vue';
import InlineMediaFile from './InlineMediaFile.vue';
import ToolCallCard from './ToolCallCard.vue';
import ThinkingIndicator from './ThinkingIndicator.vue';
import MarkdownSegments from '../render/MarkdownSegments.vue';
import ReasoningBlock from './ReasoningBlock.vue';
import WorkspaceAuthCard from './WorkspaceAuthCard.vue';

const props = defineProps<{
  message: ChatMessageView;
  sessionId?: string | undefined;
  askUsers: ChatAskUser[];
  approvals: ChatApproval[];
  timeline: ChatTimelineSegment[];
  toolEntries: ToolEntry[];
  unmatchedAsks: ChatAskUser[];
  relatedWorkspaceAuth: WorkspaceAuthorizationRequest | null;
  orphanWorkspaceAuth: WorkspaceAuthorizationRequest | null;
  contentText: string;
  isTyping: boolean;
  showThinking: boolean;
}>();

const emit = defineEmits<{
  'answer-user': [requestId: string, answers: AskUserAnswer[] | undefined];
  approve: [approvalId: string];
  reject: [approvalId: string];
  'request-root': [];
  'allow-workspace': [];
  'reject-workspace': [];
}>();

const approvalForTool = (tool: ChatToolCall): ChatApproval[] =>
  getApprovalForTool(tool, props.approvals);

const isWorkspaceAuthTool = (toolId: string): boolean =>
  getIsWorkspaceAuthTool(toolId, props.relatedWorkspaceAuth);

const isToolInterruption = (tool: ChatToolCall): boolean =>
  getIsToolInterruption(tool, props.approvals, props.relatedWorkspaceAuth);

/**
 * 子代理触发的目录授权挂到父 task 工具卡；嵌套时间线内按子工具 id 展示授权卡。
 */
const nestedWorkspaceAuth = (tool: ChatToolCall): WorkspaceAuthorizationRequest | null =>
  props.relatedWorkspaceAuth?.parentToolCallId === tool.id ? props.relatedWorkspaceAuth : null;

const toolLookup = (id: string): ChatToolCall[] => getToolLookup(props.message, id);
const askLookup = (id: string): ChatAskUser[] => getAskLookup(props.askUsers, id);
const fileLookup = (id: string) => getFileLookup(props.message, id);
</script>

<style scoped lang="less">
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
</style>
