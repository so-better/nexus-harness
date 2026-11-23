/**
 * 重新生成/编辑时的分支清理：收集应被 superseded 的消息与流式残留。
 */
import type { NexusEvent } from '@shared/events';

/**
 * 从分支起点开始收集消息 ID；只有 reasoning/text 增量而没有 completed 的消息也要清理。
 */
export const collectSupersededMessageIds = (events: readonly NexusEvent[]): Set<string> => {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'message.completed') {
      const payload = event.payload as { messageId?: string };
      if (payload.messageId) ids.add(payload.messageId);
      continue;
    }
    if (event.type === 'message.delta' || event.type === 'message.reasoning.delta') {
      const payload = event.payload as { messageId?: string };
      if (payload.messageId) ids.add(payload.messageId);
      continue;
    }
    // 投影层会在没有 completed 消息时用 assistant-<event.id> 创建占位消息
    if (event.type === 'tool.requested' || event.type === 'file.created') {
      ids.add(`assistant-${event.id}`);
    }
  }
  return ids;
};
