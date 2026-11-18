/**
 * 会话历史投影：从 append-only 事件重建供模型使用的消息序列。
 */

import type { ChatMessage, ProviderToolCall } from '@nexus/providers';
import type { EventPayloadMap } from '@shared/events';
import type { EventStore } from './event-store';

/**
 * 把单会话事件转换为 ChatMessage；工具调用与结果按事件顺序配对。
 */
export class SessionHistoryService {
  constructor(private readonly events: EventStore) {}

  /**
   * 重建历史消息；跳过运行控制事件与审批事件本身。
   */
  load(sessionId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const approvalToCall = new Map<string, string>();
    const approvalByCall = new Map<string, 'approved' | 'rejected'>();
    const pendingCalls = new Set<string>();
    let lastAssistant: ChatMessage | undefined;

    // 中断的 Run 可能留下没有结果的工具调用，必须补占位结果，避免历史非法
    const flushPending = (): void => {
      for (const toolCallId of pendingCalls) {
        pendingCalls.delete(toolCallId);
        const approvalStatus = approvalByCall.get(toolCallId);
        messages.push({
          role: 'tool',
          toolCallId,
          content: JSON.stringify({
            code: 'TOOL_RESULT_MISSING',
            message: '工具结果缺失，可能是运行中断'
          }),
          ...(approvalStatus === undefined ? {} : { approvalStatus })
        });
      }
      pendingCalls.clear();
    };

    for (const event of this.events.list(sessionId)) {
      if (event.type === 'message.completed') {
        const payload = event.payload as EventPayloadMap['message.completed'];
        flushPending();
        if (payload.role === 'user') {
          messages.push({ role: 'user', content: payload.content });
          lastAssistant = undefined;
        } else {
          const assistant: ChatMessage = {
            role: 'assistant',
            content: payload.content
          };
          messages.push(assistant);
          lastAssistant = assistant;
        }
        continue;
      }

      if (event.type === 'approval.requested') {
        const payload = event.payload as EventPayloadMap['approval.requested'];
        approvalToCall.set(payload.approvalId, payload.toolCallId);
        continue;
      }

      if (event.type === 'approval.resolved') {
        const payload = event.payload as EventPayloadMap['approval.resolved'];
        const toolCallId = approvalToCall.get(payload.approvalId);
        if (toolCallId) {
          approvalByCall.set(toolCallId, payload.decision === 'approved' ? 'approved' : 'rejected');
        }
        continue;
      }

      if (event.type === 'tool.requested') {
        const payload = event.payload as EventPayloadMap['tool.requested'];
        const call: ProviderToolCall = {
          id: payload.toolCallId,
          name: payload.name,
          arguments: payload.input
        };
        if (lastAssistant) {
          lastAssistant.toolCalls = [...(lastAssistant.toolCalls ?? []), call];
        } else {
          lastAssistant = { role: 'assistant', content: '', toolCalls: [call] };
          messages.push(lastAssistant);
        }
        pendingCalls.add(call.id);
        continue;
      }

      if (event.type === 'tool.completed' || event.type === 'tool.failed') {
        const toolCallId =
          event.type === 'tool.completed'
            ? (event.payload as EventPayloadMap['tool.completed']).toolCallId
            : (event.payload as EventPayloadMap['tool.failed']).toolCallId;
        const content =
          event.type === 'tool.completed'
            ? ((event.payload as EventPayloadMap['tool.completed']).output ?? '')
            : JSON.stringify((event.payload as EventPayloadMap['tool.failed']).error);
        pendingCalls.delete(toolCallId);
        const approvalStatus = approvalByCall.get(toolCallId);
        messages.push({
          role: 'tool',
          toolCallId,
          content,
          ...(approvalStatus === undefined ? {} : { approvalStatus })
        });
      }
    }

    flushPending();
    return messages;
  }
}
