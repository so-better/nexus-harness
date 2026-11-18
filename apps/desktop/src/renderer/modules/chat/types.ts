/**
 * 聊天视图类型：事件投影后的只读 UI 状态。
 */

/**
 * 工具调用在 UI 中的生命周期。
 */
import type { AskQuestion, AskUserAnswer } from '@shared/ask-user';

export type ToolCallStatus =
  'requested' | 'waiting_approval' | 'approved' | 'rejected' | 'running' | 'succeeded' | 'failed';

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
 * 会话流中的一条消息。
 */
export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ChatToolCall[];
  createdAt: number;
  streaming?: boolean;
  superseded?: boolean;
  hidden?: boolean;
  runId?: string;
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
  merged?: boolean;
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
