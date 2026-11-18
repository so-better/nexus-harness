/**
 * 事件投影：把 append-only 事件转换为消息、工具调用、审批与用量。
 */

import type { EventPayloadMap, NexusEvent } from '@shared/events';
import type {
  ChatApproval,
  ChatMessageView,
  ChatProjection,
  ChatToolCall,
  ChatUsage
} from './types';

const emptyUsage = (): ChatUsage => ({ inputTokens: 0, outputTokens: 0, cost: 0 });

/**
 * 按事件顺序重建聊天视图；消息与工具调用保持原始顺序。
 */
export const projectEvents = (events: readonly NexusEvent[]): ChatProjection => {
  const messages: ChatMessageView[] = [];
  const approvals: ChatApproval[] = [];
  const usage = emptyUsage();
  let lastAssistant: ChatMessageView | undefined;
  let runId: string | undefined;
  let running = false;
  let status: ChatProjection['status'] = 'idle';
  let error: string | undefined;

  for (const event of events) {
    if (event.type === 'message.completed') {
      const payload = event.payload as EventPayloadMap['message.completed'];
      const message: ChatMessageView = {
        id: payload.messageId,
        role: payload.role,
        content: payload.content,
        toolCalls: [],
        createdAt: event.ts
      };
      messages.push(message);
      lastAssistant = payload.role === 'assistant' ? message : undefined;
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
          createdAt: event.ts
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
      continue;
    }

    if (event.type === 'run.failed') {
      const payload = event.payload as EventPayloadMap['run.failed'];
      running = false;
      status = 'failed';
      error = payload.error.message;
      messages.push(systemMessage(event, `${payload.error.code}: ${payload.error.message}`));
      continue;
    }

    if (event.type === 'run.cancelled') {
      running = false;
      status = 'cancelled';
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

  return {
    messages,
    approvals,
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
  for (const message of messages) {
    const tool = message.toolCalls.find((item) => item.id === toolCallId);
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
