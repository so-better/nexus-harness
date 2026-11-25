/**
 * 会话历史投影：从 append-only 事件重建供模型使用的消息序列。
 */

import { readFileSync, statSync } from 'node:fs';
import type { ChatImage, ChatMessage, ProviderToolCall } from '@nexus/providers';
import type { EventPayloadMap } from '@shared/events';
import { appendFileReferences } from '@shared/files';
import type { ArtifactService } from '../artifacts/artifact-service';
import { downscaleImage } from '../attachments/image-downscale';
import type { EventStore } from './event-store';

const MAX_HISTORY_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 从事件中的本地图片引用重新读取视觉内容；缺失或超限时跳过，并按最大边长降采样。
 */
const loadHistoryImages = async (
  refs: Array<{ path: string; mime: string }> | undefined
): Promise<ChatImage[]> => {
  if (!refs?.length) return [];
  const images: ChatImage[] = [];
  for (const ref of refs.slice(0, 4)) {
    try {
      if (statSync(ref.path).size > MAX_HISTORY_IMAGE_BYTES) continue;
      const scaled = await downscaleImage(readFileSync(ref.path), ref.mime);
      images.push({ mimeType: scaled.mimeType, data: scaled.data });
    } catch {
      // 文件被移动或删除时省略该图片，不阻断历史恢复
    }
  }
  return images;
};

/**
 * 把单会话事件转换为 ChatMessage；工具调用与结果按事件顺序配对。
 */
export class SessionHistoryService {
  constructor(
    private readonly events: EventStore,
    private readonly artifacts?: ArtifactService
  ) {}

  /**
   * 重建历史消息；跳过运行控制事件与审批事件本身。
   */
  async load(sessionId: string, beforeMessageId?: string): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    const approvalToCall = new Map<string, string>();
    const approvalByCall = new Map<string, 'approved' | 'rejected'>();
    const pendingCalls = new Set<string>();
    let lastAssistant: ChatMessage | undefined;
    let skipFollowingTools = false;

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

    // 子代理事件不进入父会话上下文；实时嵌套只用于 UI
    const allEvents = this.events.list(sessionId).filter((event) => !event.parentToolCallId);
    const supersededIds = new Set(
      allEvents
        .filter((event) => event.type === 'message.superseded')
        .map((event) => (event.payload as EventPayloadMap['message.superseded']).messageId)
    );
    let boundary = allEvents.length;
    if (beforeMessageId) {
      const found = allEvents.findIndex(
        (event) =>
          event.type === 'message.completed' &&
          (event.payload as EventPayloadMap['message.completed']).messageId === beforeMessageId
      );
      if (found >= 0) boundary = found;
    }

    // 使用最近一次压缩快照，避免每次 Run 都从完整历史重新压缩。
    let sourceStart = 0;
    if (this.artifacts) {
      for (let index = boundary - 1; index >= 0; index -= 1) {
        const candidate = allEvents[index];
        if (candidate?.type !== 'context.compacted') continue;
        const snapshotRef = (candidate.payload as EventPayloadMap['context.compacted']).snapshotRef;
        if (!snapshotRef) continue;
        const editedAfterSnapshot = allEvents
          .slice(index + 1, boundary)
          .some(
            (event) =>
              event.type === 'message.edited' ||
              event.type === 'message.regenerated' ||
              event.type === 'message.superseded'
          );
        if (editedAfterSnapshot) break;
        const stored = await this.artifacts.read(sessionId, snapshotRef);
        if (!stored) break;
        try {
          const parsed: unknown = JSON.parse(stored.content);
          if (!Array.isArray(parsed)) break;
          messages.push(
            ...(parsed as ChatMessage[]).filter((message) => message.role !== 'system')
          );
          sourceStart = index + 1;
        } catch {
          // 快照损坏时回退到完整事件历史
        }
        break;
      }
    }
    const sourceEvents = allEvents.slice(sourceStart, boundary);

    for (const event of sourceEvents) {
      if (event.type === 'message.completed') {
        const payload = event.payload as EventPayloadMap['message.completed'];
        flushPending();
        if (supersededIds.has(payload.messageId)) {
          lastAssistant = undefined;
          skipFollowingTools = payload.role === 'assistant';
          continue;
        }
        skipFollowingTools = false;
        if (payload.role === 'assistant' && payload.error) {
          lastAssistant = undefined;
          continue;
        }
        if (payload.role === 'user') {
          const images = await loadHistoryImages(payload.images);
          messages.push({
            role: 'user',
            content: `${appendFileReferences(payload.content, payload.references)}${payload.attachments?.length ? `\n\n${payload.attachments.map((item) => `[附件] ${item.name}`).join('\n')}` : ''}`,
            ...(payload.attachments?.length
              ? { attachmentIds: payload.attachments.map((item) => item.id) }
              : {}),
            ...(images.length ? { images } : {})
          });
          lastAssistant = undefined;
        } else {
          const assistant: ChatMessage = {
            role: 'assistant',
            content: payload.content,
            ...(payload.reasoning?.trim() ? { reasoning: payload.reasoning } : {})
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
        if (skipFollowingTools) continue;
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
        if (skipFollowingTools) continue;
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
