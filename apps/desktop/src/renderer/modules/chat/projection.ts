/**
 * 事件投影：把 append-only 事件转换为消息、工具调用、审批与用量。
 */

import type { EventPayloadMap, NexusEvent } from '@shared/events';
import type {
  ChatAskUser,
  ChatApproval,
  ChatMessageView,
  ChatProjection,
  ChatTimelineSegment,
  ChatToolCall,
  ChatUsage
} from './types';

const emptyUsage = (): ChatUsage => ({ inputTokens: 0, outputTokens: 0, cost: 0 });

/**
 * 保证消息持有时间线数组。
 */
const ensureTimeline = (message: ChatMessageView): ChatTimelineSegment[] => {
  message.timeline ??= [];
  return message.timeline;
};

/**
 * 追加文本段：同一阶段内同类增量合并到已有段；
 * 只有工具/提问/文件形成新阶段后才新开段，避免晚到的推理把正文割开。
 */
const appendText = (
  message: ChatMessageView,
  kind: 'reasoning' | 'content',
  text: string
): void => {
  const timeline = ensureTimeline(message);
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const segment = timeline[index];
    if (!segment || (segment.kind !== 'reasoning' && segment.kind !== 'content')) continue;
    if (segment.kind !== kind) continue;
    const crossedBoundary = timeline
      .slice(index + 1)
      .some((item) => item.kind === 'tool' || item.kind === 'ask' || item.kind === 'file');
    if (crossedBoundary) break;
    segment.text += text;
    segment.streaming = true;
    return;
  }
  const id = `${message.id}:${kind}-${timeline.length}`;
  if (kind === 'reasoning') timeline.push({ kind: 'reasoning', id, text, streaming: true });
  else timeline.push({ kind: 'content', id, text, streaming: true });
};

const pushSegment = (message: ChatMessageView, segment: ChatTimelineSegment): void => {
  ensureTimeline(message).push(segment);
};

/**
 * 关闭文本段的流式标记。
 */
const finishSegments = (message: ChatMessageView): void => {
  for (const segment of message.timeline ?? []) {
    if (segment.kind === 'reasoning' || segment.kind === 'content') segment.streaming = false;
  }
};

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
    finishSegments(message);
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
    if (message.reasoning) base.reasoning = `${base.reasoning ?? ''}${message.reasoning}`;
    base.streaming = Boolean(base.streaming || message.streaming);
    const knownTools = new Set(base.toolCalls.map((tool) => tool.id));
    for (const tool of message.toolCalls) {
      if (!knownTools.has(tool.id)) base.toolCalls.push(tool);
    }
    const knownFiles = new Set((base.files ?? []).map((file) => file.id));
    for (const file of message.files ?? []) {
      if (!knownFiles.has(file.id)) base.files = [...(base.files ?? []), file];
    }
    if (message.usage) {
      const merged = base.usage ?? emptyUsage();
      merged.inputTokens += message.usage.inputTokens;
      merged.outputTokens += message.usage.outputTokens;
      merged.cost += message.usage.cost;
      base.usage = merged;
    }
    if (message.timeline?.length) {
      base.timeline = [...(base.timeline ?? []), ...message.timeline];
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
  let pendingFailure: { event: NexusEvent; error: { code: string; message: string } } | undefined;
  const pendingUsage = new Map<string, ChatUsage>();

  const attachUsage = (messageId: string): void => {
    const usage = pendingUsage.get(messageId);
    if (!usage) return;
    const message = messages.find((item) => item.id === messageId);
    if (!message) return;
    const existing = message.usage ?? emptyUsage();
    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.cost += usage.cost;
    message.usage = existing;
    pendingUsage.delete(messageId);
  };

  for (const event of events) {
    if (event.type === 'message.reasoning.delta') {
      const payload = event.payload as EventPayloadMap['message.reasoning.delta'];
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
      message.reasoning = (message.reasoning ?? '') + payload.text;
      appendText(message, 'reasoning', payload.text);
      message.streaming = true;
      attachUsage(payload.messageId);
      if (event.runId) message.runId = event.runId;
      lastAssistant = message;
      continue;
    }

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
      appendText(message, 'content', payload.text);
      if (event.runId) message.runId = event.runId;
      attachUsage(payload.messageId);
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
        if (payload.reasoning !== undefined) existing.reasoning = payload.reasoning;
        existing.streaming = false;
        finishSegments(existing);
        const timeline = ensureTimeline(existing);
        const reconcile = (kind: 'reasoning' | 'content', text: string): void => {
          const segments = timeline.filter(
            (segment): segment is Extract<ChatTimelineSegment, { kind: 'reasoning' | 'content' }> =>
              segment.kind === kind
          );
          if (segments.length === 0) {
            const id = `${existing.id}:${kind}-${timeline.length}`;
            if (kind === 'reasoning') timeline.push({ kind: 'reasoning', id, text });
            else timeline.push({ kind: 'content', id, text });
            return;
          }
          // 多段交错时不能用最终文本覆盖最后一段，否则会把全文重复到末段
          const [first] = segments;
          if (segments.length === 1 && first && first.text !== text) first.text = text;
        };
        if (payload.reasoning) reconcile('reasoning', payload.reasoning);
        if (payload.content) reconcile('content', payload.content);
        if (payload.error) pendingFailure = undefined;
        if (event.runId) existing.runId = event.runId;
        attachUsage(payload.messageId);
        if (payload.references?.length) existing.references = payload.references;
        if (payload.attachments?.length) existing.attachments = payload.attachments;
        lastAssistant = payload.role === 'assistant' ? existing : undefined;
      } else {
        const timeline: ChatTimelineSegment[] = [
          ...(payload.reasoning
            ? [
                {
                  kind: 'reasoning' as const,
                  id: `${payload.messageId}:reasoning-0`,
                  text: payload.reasoning
                }
              ]
            : []),
          ...(payload.content
            ? [
                {
                  kind: 'content' as const,
                  id: `${payload.messageId}:content-0`,
                  text: payload.content
                }
              ]
            : [])
        ];
        const message: ChatMessageView = {
          id: payload.messageId,
          role: payload.role,
          content: payload.content,
          ...(payload.reasoning !== undefined ? { reasoning: payload.reasoning } : {}),
          toolCalls: [],
          createdAt: event.ts,
          streaming: false,
          files: [],
          timeline,
          ...(payload.references?.length ? { references: payload.references } : {}),
          ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
          ...(event.runId ? { runId: event.runId } : {})
        };
        if (payload.error) pendingFailure = undefined;
        messages.push(message);
        attachUsage(payload.messageId);
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
      pushSegment(lastAssistant, {
        kind: 'file',
        id: `${lastAssistant.id}:file-${payload.fileId}`,
        fileId: payload.fileId
      });
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
      if (payload.name !== 'ask_user' && payload.name !== 'save_file') {
        pushSegment(lastAssistant, {
          kind: 'tool',
          id: `${lastAssistant.id}:tool-${payload.toolCallId}`,
          toolCallId: payload.toolCallId
        });
      }
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
      if (payload.messageId) {
        const target = messages.find((message) => message.id === payload.messageId);
        if (target) {
          const messageUsage = target.usage ?? emptyUsage();
          messageUsage.inputTokens += payload.inputTokens;
          messageUsage.outputTokens += payload.outputTokens;
          messageUsage.cost += payload.cost ?? 0;
          target.usage = messageUsage;
        } else {
          const queued = pendingUsage.get(payload.messageId) ?? emptyUsage();
          queued.inputTokens += payload.inputTokens;
          queued.outputTokens += payload.outputTokens;
          queued.cost += payload.cost ?? 0;
          pendingUsage.set(payload.messageId, queued);
        }
      } else {
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
      }
      continue;
    }

    if (event.type === 'run.started') {
      pendingFailure = undefined;
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
        ...(payload.toolCallId ? { toolCallId: payload.toolCallId } : {}),
        ...(event.runId ? { runId: event.runId } : {})
      });
      if (lastAssistant) {
        pushSegment(lastAssistant, {
          kind: 'ask',
          id: `${lastAssistant.id}:ask-${payload.requestId}`,
          requestId: payload.requestId
        });
      }
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
      pendingFailure = { event, error: payload.error };
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

  // 兼容旧会话：只有 run.failed、没有错误消息事件的记录
  if (pendingFailure && status === 'failed') {
    messages.push({
      id: `error-legacy-${pendingFailure.event.id}`,
      role: 'assistant',
      content: [pendingFailure.error.message, pendingFailure.error.code]
        .filter(Boolean)
        .join('\n\n'),
      toolCalls: [],
      createdAt: pendingFailure.event.ts
    });
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
