/**
 * 子代理过程投影：把保存的 ChatMessage[] 合成为事件并走 projectEvents，
 * 以便用真实聊天组件渲染（Markdown、推理、工具卡等）。
 */

import type { NexusEvent } from '@shared/events';
import { projectEvents } from './projection';
import type { ChatProjection } from './types';

interface TranscriptMessage {
  role?: string;
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{ id: string; name: string; arguments?: unknown }>;
  toolCallId?: string;
}

/**
 * 子代理审批记录；仅用于过程回看，不参与业务状态。
 */
export interface SubagentTranscriptApproval {
  runId?: string;
  approvalId: string;
  toolCallId: string;
  scope: string;
  decision?: 'approved' | 'rejected' | 'expired';
}

export interface SubagentTranscriptView {
  projection: ChatProjection;
  approvals: SubagentTranscriptApproval[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const parseApprovals = (value: unknown): SubagentTranscriptApproval[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (
      typeof item.approvalId !== 'string' ||
      typeof item.toolCallId !== 'string' ||
      typeof item.scope !== 'string'
    ) {
      return [];
    }
    const decision =
      item.decision === 'approved' || item.decision === 'rejected' || item.decision === 'expired'
        ? item.decision
        : undefined;
    return [
      {
        approvalId: item.approvalId,
        toolCallId: item.toolCallId,
        scope: item.scope,
        ...(typeof item.runId === 'string' ? { runId: item.runId } : {}),
        ...(decision ? { decision } : {})
      }
    ];
  });
};

const event = (
  sessionId: string,
  seq: number,
  type: NexusEvent['type'],
  payload: unknown
): NexusEvent =>
  ({
    id: `subagent-event-${seq}`,
    sessionId,
    runId: 'subagent',
    seq,
    type,
    version: 1,
    ts: seq,
    payload
  }) as NexusEvent;

const buildEvents = (
  sessionId: string,
  source: TranscriptMessage[],
  createdAt: number
): NexusEvent[] => {
  const events: NexusEvent[] = [];
  let seq = 0;
  let messageIndex = 0;

  for (const message of source) {
    if (!message || message.role === 'system') continue;
    const messageId = `subagent-msg-${messageIndex}`;
    messageIndex += 1;

    if (message.role === 'user') {
      seq += 1;
      events.push(
        event(sessionId, seq, 'message.completed', {
          messageId,
          role: 'user',
          content: message.content ?? ''
        })
      );
      continue;
    }

    if (message.role === 'assistant') {
      seq += 1;
      events.push(
        event(sessionId, seq, 'message.completed', {
          messageId,
          role: 'assistant',
          content: message.content ?? '',
          ...(message.reasoning?.trim() ? { reasoning: message.reasoning } : {})
        })
      );
      for (const call of message.toolCalls ?? []) {
        seq += 1;
        events.push(
          event(sessionId, seq, 'tool.requested', {
            toolCallId: call.id,
            name: call.name,
            input: call.arguments ?? {}
          })
        );
      }
      continue;
    }

    if (message.role === 'tool') {
      seq += 1;
      events.push(
        event(sessionId, seq, 'tool.completed', {
          toolCallId: message.toolCallId ?? `subagent-tool-${messageIndex}`,
          ok: true,
          output: message.content ?? ''
        })
      );
    }
  }

  return events.map((item) => ({ ...item, ts: createdAt + item.seq }));
};

/**
 * 解析子代理过程 Artifact：兼容旧版裸消息数组与新版 { messages, approvals }。
 */
export const readSubagentTranscript = (
  sessionId: string,
  content: string
): SubagentTranscriptView => {
  const parsed: unknown = JSON.parse(content);
  let source: TranscriptMessage[];
  let approvals: SubagentTranscriptApproval[];
  let createdAt = Date.now();
  if (Array.isArray(parsed)) {
    source = parsed as TranscriptMessage[];
    approvals = [];
  } else if (isRecord(parsed) && Array.isArray(parsed.messages)) {
    source = parsed.messages as TranscriptMessage[];
    approvals = parseApprovals(parsed.approvals);
    if (typeof parsed.createdAt === 'number') createdAt = parsed.createdAt;
  } else {
    throw new Error('INVALID_SUBAGENT_TRANSCRIPT');
  }

  return {
    projection: projectEvents(buildEvents(sessionId, source, createdAt)),
    approvals
  };
};

/**
 * 把子代理完整对话投影为可渲染的 ChatProjection；system 消息跳过。
 */
export const projectSubagentTranscript = (sessionId: string, content: string): ChatProjection =>
  readSubagentTranscript(sessionId, content).projection;
