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

interface SubagentProjectionCacheEntry {
  processedCount: number;
  lastEvent: NexusEvent | undefined;
  projection: ChatProjection;
}

/**
 * 子代理嵌套投影缓存：最后一条事件不变直接复用；
 * 纯 delta 追加时只改目标消息，避免每次流式都重扫完整子代理事件。
 */
const subagentProjectionCache = new Map<string, SubagentProjectionCacheEntry>();
const MAX_SUBAGENT_PROJECTION_CACHE = 32;

const isDeltaEvent = (event: NexusEvent | undefined): boolean =>
  Boolean(event && (event.type === 'message.delta' || event.type === 'message.reasoning.delta'));

const applyDeltaEvents = (
  projection: ChatProjection,
  source: readonly NexusEvent[]
): ChatProjection | undefined => {
  const messages = projection.messages.slice();
  const indexById = new Map(messages.map((message, index) => [message.id, index]));
  const cloned = new Map<string, ChatMessageView>();

  for (const event of source) {
    if (event.type !== 'message.delta' && event.type !== 'message.reasoning.delta')
      return undefined;
    const payload = event.payload as { messageId?: unknown; text?: unknown };
    if (typeof payload.messageId !== 'string' || typeof payload.text !== 'string') {
      return undefined;
    }
    const index = indexById.get(payload.messageId);
    if (index === undefined) return undefined;

    if (!cloned.has(payload.messageId)) {
      const original = messages[index];
      if (!original) return undefined;
      const timeline = original.timeline?.map((segment) => ({ ...segment }));
      const copy: ChatMessageView = { ...original, ...(timeline ? { timeline } : {}) };
      cloned.set(payload.messageId, copy);
      messages[index] = copy;
    }
    const message = cloned.get(payload.messageId);
    if (!message) return undefined;

    if (event.type === 'message.delta') {
      message.content += payload.text;
      appendText(message, 'content', payload.text);
    } else {
      message.reasoning = (message.reasoning ?? '') + payload.text;
      appendText(message, 'reasoning', payload.text);
    }
    message.streaming = true;
  }

  return { ...projection, messages };
};

/**
 * 清空子代理投影缓存；供测试验证增量结果与完整重算一致。
 */
export const clearSubagentProjectionCache = (): void => {
  subagentProjectionCache.clear();
};

const projectSubagentRun = (
  childRunId: string,
  runEvents: readonly NexusEvent[]
): ChatProjection => {
  const lastEvent = runEvents[runEvents.length - 1];
  const cached = subagentProjectionCache.get(childRunId);
  if (cached && cached.lastEvent === lastEvent) return cached.projection;

  // 仅当上一批也停在 delta 时才走增量，确保 usage/completed 等状态先完整重算
  if (
    cached &&
    isDeltaEvent(cached.lastEvent) &&
    isDeltaEvent(lastEvent) &&
    cached.processedCount <= runEvents.length
  ) {
    const projected = applyDeltaEvents(cached.projection, runEvents.slice(cached.processedCount));
    if (projected) {
      subagentProjectionCache.set(childRunId, {
        processedCount: runEvents.length,
        lastEvent,
        projection: projected
      });
      return projected;
    }
  }

  const projection = projectEvents(runEvents, { ignoreParentToolCallId: true });
  subagentProjectionCache.set(childRunId, {
    processedCount: runEvents.length,
    lastEvent,
    projection
  });
  if (subagentProjectionCache.size > MAX_SUBAGENT_PROJECTION_CACHE) {
    const oldest = subagentProjectionCache.keys().next().value;
    if (oldest !== undefined) subagentProjectionCache.delete(oldest);
  }
  return projection;
};

/**
 * 按事件顺序重建聊天视图；消息与工具调用保持原始顺序。
 * ignoreParentToolCallId 用于子代理嵌套投影，让子代理事件按普通事件处理。
 */
export const projectEvents = (
  events: readonly NexusEvent[],
  options: { ignoreParentToolCallId?: boolean } = {}
): ChatProjection => {
  const messages: ChatMessageView[] = [];
  const approvals: ChatApproval[] = [];
  const askUsers: ChatAskUser[] = [];
  const usage = emptyUsage();
  let lastAssistant: ChatMessageView | undefined;
  let runId: string | undefined;
  let running = false;
  let status: ChatProjection['status'] = 'idle';
  let error: string | undefined;
  /** 最近一次失败的错误码；用于区分“步数上限”等可继续的场景 */
  let errorCode: string | undefined;
  let pendingFailure: { event: NexusEvent; error: { code: string; message: string } } | undefined;
  const pendingUsage = new Map<string, ChatUsage>();
  let compactionNoticeShown = false;

  // 子代理事件按 parentToolCallId 分组，主会话跳过；之后各自递归投影为嵌套时间线
  const childEventsByParent = new Map<string, NexusEvent[]>();
  if (!options.ignoreParentToolCallId) {
    for (const event of events) {
      if (!event.parentToolCallId) continue;
      const list = childEventsByParent.get(event.parentToolCallId) ?? [];
      list.push(event);
      childEventsByParent.set(event.parentToolCallId, list);
    }
  }

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
    if (event.parentToolCallId && !options.ignoreParentToolCallId) {
      // 子代理用量仍计入父会话总量；其余事件留给嵌套投影
      if (event.type === 'usage.recorded') {
        const payload = event.payload as EventPayloadMap['usage.recorded'];
        usage.inputTokens += payload.inputTokens;
        usage.outputTokens += payload.outputTokens;
        usage.cost += payload.cost ?? 0;
      }
      continue;
    }
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
        if (payload.durationMs !== undefined) existing.durationMs = payload.durationMs;
        existing.contentChars = [...payload.content].length;
        if (payload.error) existing.error = true;
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
          ...(payload.durationMs === undefined ? {} : { durationMs: payload.durationMs }),
          contentChars: [...payload.content].length,
          ...(payload.error ? { error: true } : {}),
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
      // 子代理产物不挂到父会话消息上，避免混淆；完整过程在子代理 Artifact 中
      if (payload.parentToolCallId) continue;
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
        status: 'pending',
        ...(payload.toolName === undefined ? {} : { toolName: payload.toolName }),
        ...(payload.input === undefined ? {} : { input: payload.input })
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
        // 同一工具可能对应多个子代理审批：仍有 pending 时保持等待，避免被单个结果覆盖
        const related = approvals.filter((item) => item.toolCallId === approval.toolCallId);
        const pending = related.some((item) => item.status === 'pending');
        const rejected = related.some(
          (item) => item.status === 'rejected' || item.status === 'expired'
        );
        updateTool(messages, approval.toolCallId, (tool) => {
          tool.status = pending ? 'waiting_approval' : rejected ? 'rejected' : 'approved';
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

    if (event.type === 'subagent.started') {
      const payload = event.payload as EventPayloadMap['subagent.started'];
      updateTool(messages, payload.parentToolCallId, (tool) => {
        tool.subagent = {
          agent: payload.agent,
          ...(payload.description ? { description: payload.description } : {}),
          status: 'running',
          steps: 0,
          toolCalls: 0,
          progress: []
        };
      });
      continue;
    }

    if (event.type === 'subagent.progress') {
      const payload = event.payload as EventPayloadMap['subagent.progress'];
      updateTool(messages, payload.parentToolCallId, (tool) => {
        if (!tool.subagent) return;
        // 完成事件与开始事件同一工具时合并，避免步骤列表重复
        if (payload.ok !== undefined) {
          const pending = [...tool.subagent.progress]
            .reverse()
            .find((step) => step.name === payload.name && step.ok === undefined);
          if (pending) {
            pending.ok = payload.ok;
            tool.subagent.toolCalls += 1;
            return;
          }
        }
        tool.subagent.progress.push({
          id: `${tool.id}:sub-${tool.subagent.progress.length}`,
          name: payload.name,
          ...(payload.ok === undefined ? {} : { ok: payload.ok })
        });
        if (payload.ok !== undefined) tool.subagent.toolCalls += 1;
      });
      continue;
    }

    if (event.type === 'subagent.completed') {
      const payload = event.payload as EventPayloadMap['subagent.completed'];
      updateTool(messages, payload.parentToolCallId, (tool) => {
        const base = tool.subagent ?? {
          agent: payload.agent,
          status: 'running' as const,
          steps: 0,
          toolCalls: 0,
          progress: []
        };
        tool.subagent = {
          ...base,
          status: payload.ok ? 'succeeded' : 'failed',
          steps: payload.steps,
          toolCalls: payload.toolCalls,
          summary: payload.summary,
          ...(payload.transcriptRef === undefined ? {} : { transcriptRef: payload.transcriptRef }),
          ...(payload.transcripts === undefined ? {} : { transcripts: payload.transcripts }),
          ...(payload.usage ? { usage: payload.usage } : {})
        };
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
      errorCode = undefined;
      continue;
    }

    if (event.type === 'run.completed') {
      running = false;
      status = 'completed';
      errorCode = undefined;
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
      errorCode = payload.error.code;
      pendingFailure = { event, error: payload.error };
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'run.cancelled') {
      running = false;
      status = 'cancelled';
      errorCode = undefined;
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'run.interrupted') {
      running = false;
      status = 'interrupted';
      errorCode = undefined;
      finishStreaming(messages);
      finishAskUsers(askUsers);
      finishApprovals(approvals, messages);
      continue;
    }

    if (event.type === 'context.compacted') {
      const payload = event.payload as EventPayloadMap['context.compacted'];
      const strategies = payload.strategy.split('+');
      const meaningful = strategies.some(
        (strategy) =>
          strategy === 'summarized' ||
          strategy === 'summary_failed' ||
          strategy === 'hard_truncated'
      );
      if (meaningful && !compactionNoticeShown) {
        compactionNoticeShown = true;
        messages.push({
          id: `compaction-${event.id}`,
          role: 'system',
          content: '会话上下文较长，我已自动整理较早内容，保留关键目标和未完成事项。我们继续。',
          toolCalls: [],
          createdAt: event.ts,
          compactionNotice: true
        });
      }
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
      error: true,
      toolCalls: [],
      createdAt: pendingFailure.event.ts
    });
  }

  // 兼容旧记录：中断的 reasoning 尝试没有 completed/superseded，不能让它在历史里残留
  for (const message of messages) {
    if (
      message.role !== 'assistant' ||
      message.superseded ||
      message.hidden ||
      !message.reasoning?.trim() ||
      message.content.trim() ||
      message.toolCalls.length ||
      message.files?.length ||
      message.references?.length ||
      message.attachments?.length
    ) {
      continue;
    }
    if (!running || message !== lastAssistant) message.hidden = true;
  }

  for (const [parentToolCallId, childEvents] of childEventsByParent) {
    const byRun = new Map<string, NexusEvent[]>();
    for (const childEvent of childEvents) {
      // 子代理提问已禁用；审批保留在嵌套时间线内直接展示
      if (childEvent.type.startsWith('ask_user.')) continue;
      const childRunId = childEvent.runId ?? 'subagent';
      const list = byRun.get(childRunId) ?? [];
      list.push(childEvent);
      byRun.set(childRunId, list);
    }
    if (byRun.size === 0) continue;
    const runs = [...byRun.entries()].map(([childRunId, runEvents]) => ({
      runId: childRunId,
      projection: projectSubagentRun(childRunId, runEvents)
    }));
    // 子代理审批同时并入顶层列表，供全局待审批计数与跳转使用；
    // 其 toolCallId 指向子代理工具，不会在父消息里重复渲染审批卡。
    let pendingApprovals = 0;
    for (const run of runs) {
      for (const approval of run.projection.approvals) {
        const existing = approvals.find((item) => item.id === approval.id);
        if (existing) Object.assign(existing, approval);
        else approvals.push(approval);
        if (approval.status === 'pending') pendingApprovals += 1;
      }
    }
    updateTool(messages, parentToolCallId, (tool) => {
      const base = tool.subagent ?? {
        agent: 'general' as const,
        status: 'running' as const,
        steps: 0,
        toolCalls: 0,
        progress: []
      };
      tool.subagent = { ...base, runs, pendingApprovals };
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
    ...(error === undefined ? {} : { error }),
    ...(errorCode === undefined ? {} : { errorCode })
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
