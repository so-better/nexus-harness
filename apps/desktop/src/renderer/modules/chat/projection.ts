/**
 * 事件投影：把 append-only 事件转换为消息、工具调用、审批与用量。
 */

import type { EventPayloadMap, NexusEvent } from '@shared/events';
import type {
  ChatAskUser,
  ChatApproval,
  ChatMessageView,
  ChatProjection,
  ChatToolCall,
  ChatUsage
} from './types';

const emptyUsage = (): ChatUsage => ({ inputTokens: 0, outputTokens: 0, cost: 0 });

/**
 * Run 终止时取消尚未回答的问题，避免残留旧卡片。
 */
const finishAskUsers = (askUsers: ChatAskUser[]): void => {
  for (const ask of askUsers) {
    if (ask.status === 'pending') ask.status = 'cancelled';
  }
};

/**
 * Run 终止时关闭残留的流式状态，避免光标一直闪烁。
 */
const finishStreaming = (messages: ChatMessageView[]): void => {
  for (const message of messages) {
    if (message.streaming) message.streaming = false;
  }
};

/**
 * Run 终止时让未决审批失效，避免历史会话继续显示可点击的审批。
 */
const finishApprovals = (approvals: ChatApproval[], messages: ChatMessageView[]): void => {
  for (const approval of approvals) {
    if (approval.status !== 'pending') continue;
    approval.status = 'expired';
    updateTool(messages, approval.toolCallId, (tool) => {
      tool.status = 'expired';
    });
  }
};

/**
 * 同一 Run 的助手消息合并为一个气泡；工具调用、文件和文本按发生顺序拼接。
 */
const mergeAssistantRuns = (messages: ChatMessageView[], askUsers: ChatAskUser[]): void => {
  const baseByRun = new Map<string, ChatMessageView>();

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.runId || message.hidden || message.superseded) {
      continue;
    }
    const base = baseByRun.get(message.runId);
    if (!base) {
      baseByRun.set(message.runId, message);
      continue;
    }

    const content = [base.content, message.content].filter(Boolean).join('\n\n');
    base.content = content;
    base.streaming = Boolean(base.streaming || message.streaming);
    const knownTools = new Set(base.toolCalls.map((tool) => tool.id));
    for (const tool of message.toolCalls) {
      if (!knownTools.has(tool.id)) base.toolCalls.push(tool);
    }
    const knownFiles = new Set((base.files ?? []).map((file) => file.id));
    for (const file of message.files ?? []) {
      if (!knownFiles.has(file.id)) base.files = [...(base.files ?? []), file];
    }
    for (const ask of askUsers) {
      if (ask.messageId === message.id) ask.messageId = base.id;
    }
    message.hidden = true;
  }
};

/**
 * 按事件顺序重建聊天视图；消息与工具调用保持原始顺序。
 */
export const projectEvents = (events: readonly NexusEvent[]): ChatProjection => {
  const messages: ChatMessageView[] = [];
  const approvals: ChatApproval[] = [];
  const askUsers: ChatAskUser[] = [];
  const usage = emptyUsage();
  let lastAssistant: ChatMessageView | undefined;
  let runId: string | undefined;
  let running = false;
  let status: ChatProjection['status'] = 'idle';
  let error: string | undefined;

  for (const event of events) {
    if (event.type === 'message.delta') {
      const payload = event.payload as EventPayloadMap['message.delta'];
      let message = messages.find((item) => item.id === payload.messageId);
      if (!message) {
        message = {
          id: payload.messageId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdAt: event.ts,
          streaming: true,
          files: [],
          ...(event.runId ? { runId: event.runId } : {})
        };
        messages.push(message);
      }
      message.content += payload.text;
      if (event.runId) message.runId = event.runId;
      message.streaming = true;
      lastAssistant = message;
      continue;
    }

    if (event.type === 'message.completed') {
      const payload = event.payload as EventPayloadMap['message.completed'];
      const existing = messages.find((item) => item.id === payload.messageId);
      if (existing) {
        existing.role = payload.role;
        existing.content = payload.content;
        existing.streaming = false;
        if (event.runId) existing.runId = event.runId;
        if (payload.references?.length) existing.references = payload.references;
        lastAssistant = payload.role === 'assistant' ? existing : undefined;
      } else {
        const message: ChatMessageView = {
          id: payload.messageId,
          role: payload.role,
          content: payload.content,
          toolCalls: [],
          createdAt: event.ts,
          streaming: false,
          files: [],
          ...(payload.references?.length ? { references: payload.references } : {}),
          ...(event.runId ? { runId: event.runId } : {})
        };
        messages.push(message);
        lastAssistant = payload.role === 'assistant' ? message : undefined;
      }
      continue;
    }

    if (event.type === 'message.superseded') {
      const payload = event.payload as EventPayloadMap['message.superseded'];
      const message = messages.find((item) => item.id === payload.messageId);
      if (message) {
        message.superseded = true;
        if (lastAssistant === message) lastAssistant = undefined;
      }
      continue;
    }

    if (event.type === 'file.created') {
      const payload = event.payload as EventPayloadMap['file.created'];
      if (!lastAssistant) {
        lastAssistant = {
          id: `assistant-${event.id}`,
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdAt: event.ts,
          files: [],
          ...(event.runId ? { runId: event.runId } : {})
        };
        messages.push(lastAssistant);
      }
      lastAssistant.files = [
        ...(lastAssistant.files ?? []),
        {
          id: payload.fileId,
          sessionId: event.sessionId,
          ...(event.runId ? { runId: event.runId } : {}),
          name: payload.name,
          mime: payload.mime,
          bytes: payload.bytes,
          source: payload.source,
          createdAt: event.ts
        }
      ];
      continue;
    }

    if (event.type === 'tool.requested') {
      const payload = event.payload as EventPayloadMap['tool.requested'];
      if (!lastAssistant) {
        lastAssistant = {
          id: `assistant-${event.id}`,
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdAt: event.ts,
          files: [],
          ...(event.runId ? { runId: event.runId } : {})
        };
        messages.push(lastAssistant);
      }
      lastAssistant.toolCalls.push({
        id: payload.toolCallId,
        name: payload.name,
        input: payload.input,
        status: 'requested'
      });
      continue;
    }

    if (event.type === 'approval.requested') {
      const payload = event.payload as EventPayloadMap['approval.requested'];
      approvals.push({
        id: payload.approvalId,
        toolCallId: payload.toolCallId,
        scope: payload.scope,
        status: 'pending'
      });
      updateTool(messages, payload.toolCallId, (tool) => {
        tool.approvalId = payload.approvalId;
        tool.status = 'waiting_approval';
      });
      status = 'waiting_approval';
      continue;
    }

    if (event.type === 'approval.resolved') {
      const payload = event.payload as EventPayloadMap['approval.resolved'];
      const approval = approvals.find((item) => item.id === payload.approvalId);
      if (approval) {
        approval.status = payload.decision;
        updateTool(messages, approval.toolCallId, (tool) => {
          tool.status = payload.decision === 'approved' ? 'approved' : 'rejected';
        });
      }
      status = running ? 'running' : status;
      continue;
    }

    if (event.type === 'tool.completed') {
      const payload = event.payload as EventPayloadMap['tool.completed'];
      updateTool(messages, payload.toolCallId, (tool) => {
        tool.status = 'succeeded';
        if (payload.output !== undefined) tool.output = payload.output;
        if (payload.artifactId) tool.artifactId = payload.artifactId;
      });
      continue;
    }

    if (event.type === 'tool.failed') {
      const payload = event.payload as EventPayloadMap['tool.failed'];
      updateTool(messages, payload.toolCallId, (tool) => {
        tool.status = 'failed';
        tool.error = payload.error;
      });
      continue;
    }

    if (event.type === 'usage.recorded') {
      const payload = event.payload as EventPayloadMap['usage.recorded'];
      usage.inputTokens += payload.inputTokens;
      usage.outputTokens += payload.outputTokens;
      usage.cost += payload.cost ?? 0;
      const target = [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === 'assistant' && (!event.runId || message.runId === event.runId)
        );
      if (target) {
        const messageUsage = target.usage ?? emptyUsage();
        messageUsage.inputTokens += payload.inputTokens;
        messageUsage.outputTokens += payload.outputTokens;
        messageUsage.cost += payload.cost ?? 0;
        target.usage = messageUsage;
      }
      continue;
    }

    if (event.type === 'run.started') {
      runId = event.runId;
      running = true;
      status = 'running';
      error = undefined;
      continue;
    }

    if (event.type === 'run.completed') {
      running = false;
      status = 'completed';
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'ask_user.requested') {
      const payload = event.payload as EventPayloadMap['ask_user.requested'];
      askUsers.push({
        requestId: payload.requestId,
        questions: payload.questions,
        status: 'pending',
        ...(lastAssistant ? { messageId: lastAssistant.id } : {}),
        ...(event.runId ? { runId: event.runId } : {})
      });
      status = 'waiting_user';
      continue;
    }

    if (event.type === 'ask_user.resolved') {
      const payload = event.payload as EventPayloadMap['ask_user.resolved'];
      const ask = askUsers.find((item) => item.requestId === payload.requestId);
      if (ask) {
        ask.status = payload.cancelled ? 'cancelled' : 'resolved';
        ask.answers = payload.answers;
      }
      status = running ? 'running' : status;
      continue;
    }

    if (event.type === 'run.failed') {
      const payload = event.payload as EventPayloadMap['run.failed'];
      running = false;
      status = 'failed';
      error = payload.error.message;
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'run.cancelled') {
      running = false;
      status = 'cancelled';
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'run.interrupted') {
      running = false;
      status = 'interrupted';
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'context.compacted') {
      const payload = event.payload as EventPayloadMap['context.compacted'];
      messages.push(
        systemMessage(
          event,
          `上下文压缩：${payload.beforeTokens} → ${payload.afterTokens} tokens（${payload.strategy}）`
        )
      );
    }
  }

  mergeAssistantRuns(messages, askUsers);

  return {
    messages: messages.filter((message) => !message.superseded && !message.hidden),
    approvals,
    askUsers,
    usage,
    running,
    status,
    ...(runId === undefined ? {} : { runId }),
    ...(error === undefined ? {} : { error })
  };
};

/**
 * 更新工具调用；找不到时忽略，避免事件顺序异常导致 UI 崩溃。
 */
const updateTool = (
  messages: ChatMessageView[],
  toolCallId: string,
  update: (tool: ChatToolCall) => void
): void => {
  // 从最新消息向前查找，避免异常重复的工具调用 ID 更新到旧消息。
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const tool = messages[index]?.toolCalls.find((item) => item.id === toolCallId);
    if (tool) {
      update(tool);
      return;
    }
  }
};

/**
 * 生成系统提示消息。
 */
const systemMessage = (event: NexusEvent, content: string): ChatMessageView => ({
  id: `system-${event.id}`,
  role: 'system',
  content,
  toolCalls: [],
  createdAt: event.ts
});
