/**
 * 聊天视图类型：事件投影后的只读 UI 状态。
 */

/**
 * 工具调用在 UI 中的生命周期。
 */
import type { OutputFile } from '@shared/ipc/contracts';
import type { AskQuestion, AskUserAnswer } from '@shared/ask-user';
import type { MessageAttachment, MessageFileReference } from '@shared/events';

export type ToolCallStatus =
  | 'requested'
  | 'waiting_approval'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'running'
  | 'succeeded'
  | 'failed';

/**
 * 单次工具调用展示数据。
 */
export interface ChatToolCall {
  id: string;
  name: string;
  input: unknown;
  status: ToolCallStatus;
  output?: string;
  error?: { code: string; message: string };
  artifactId?: string;
  approvalId?: string;
}

/**
 * 助手消息内的有序时间线段：文本、推理、工具、提问与文件按事件顺序排列。
 */
export type ChatTimelineSegment =
  | { kind: 'reasoning'; id: string; text: string; streaming?: boolean }
  | { kind: 'content'; id: string; text: string; streaming?: boolean }
  | { kind: 'tool'; id: string; toolCallId: string }
  | { kind: 'ask'; id: string; requestId: string }
  | { kind: 'file'; id: string; fileId: string };

/**
 * 会话流中的一条消息。
 */
export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  toolCalls: ChatToolCall[];
  createdAt: number;
  streaming?: boolean;
  superseded?: boolean;
  hidden?: boolean;
  runId?: string;
  usage?: ChatUsage;
  files?: OutputFile[];
  references?: MessageFileReference[];
  attachments?: MessageAttachment[];
  timeline?: ChatTimelineSegment[];
}

/**
 * 待处理或已处理的审批。
 */
export interface ChatApproval {
  id: string;
  toolCallId: string;
  scope: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

/**
 * 当前会话的累计用量。
 */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

/**
 * 事件流投影结果；UI 只读取，不持有业务真相。
 */
export interface ChatAskUser {
  requestId: string;
  questions: AskQuestion[];
  status: 'pending' | 'resolved' | 'cancelled';
  answers?: AskUserAnswer[];
  messageId?: string;
  runId?: string;
  toolCallId?: string;
}

export interface ChatProjection {
  messages: ChatMessageView[];
  approvals: ChatApproval[];
  askUsers: ChatAskUser[];
  usage: ChatUsage;
  runId?: string;
  running: boolean;
  status:
    | 'idle'
    | 'running'
    | 'waiting_approval'
    | 'waiting_user'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted';
  error?: string;
}
