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
 * 子代理进度步骤：用于在 task 工具卡里展示其内部工具调用。
 */
export interface ChatSubagentProgress {
  id: string;
  name: string;
  ok?: boolean;
}

/**
 * task 工具派生出的子代理状态；仅用于展示，不参与业务真相。
 */
export interface ChatSubagent {
  agent: 'explore' | 'general';
  description?: string;
  status: 'running' | 'succeeded' | 'failed';
  steps: number;
  toolCalls: number;
  summary?: string;
  /** 完整子代理对话的 Artifact 引用；用于“查看过程” */
  transcriptRef?: string;
  /** 并行子代理：每个子任务的过程引用与序号 */
  transcripts?: Array<{ index: number; ref: string }>;
  /** 实时嵌套：每个子代理 run 的投影（含消息、工具、推理） */
  runs?: Array<{ runId: string; projection: ChatProjection }>;
  /** 嵌套时间线内待审批数量，用于父卡片状态提示 */
  pendingApprovals?: number;
  progress: ChatSubagentProgress[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
    cost?: number | undefined;
  };
}

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
  subagent?: ChatSubagent;
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
  /** 上下文压缩提示，使用系统消息样式 */
  compactionNotice?: boolean;
  runId?: string;
  usage?: ChatUsage;
  /** 本条助手消息的模型生成耗时（毫秒），不含工具执行与上下文准备 */
  durationMs?: number;
  /** 本条助手消息正文的字符数（Unicode 码点；复合 emoji 可能计多个） */
  contentChars?: number;
  /** 是否为错误气泡（合成助手消息），用于抑制尾部统计 */
  error?: boolean;
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
  /** 子代理审批：实际待批准的工具名与参数，用于展示完整 diff/命令 */
  toolName?: string;
  input?: unknown;
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
  /** 最近一次失败的错误码；用于区分步数上限等可继续的场景 */
  errorCode?: string;
}
