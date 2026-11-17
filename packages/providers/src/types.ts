/* Provider 契约：归一化消息、工具 schema 与流式事件。 */

import type { UsageSummary } from '@nexus/shared';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/* 归一化工具调用，arguments 已解析为对象。 */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ProviderToolCall[];
  toolCallId?: string;
  /* 宿主元数据，Provider 忽略；用于压缩摘要保留审批结论。 */
  approvalStatus?: 'approved' | 'rejected';
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  reasoning: boolean;
}

export interface ProviderRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  extraParams?: Record<string, unknown>;
  signal?: AbortSignal;
}

export type ProviderStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call-start'; id: string; name: string }
  | { type: 'tool-call-delta'; id: string; argumentsDelta: string }
  | { type: 'tool-call-end'; toolCall: ProviderToolCall }
  | { type: 'usage'; usage: UsageSummary }
  | { type: 'finish'; reason: string }
  | { type: 'error'; code: string; message: string };

/* 统一聊天模型接口；实现方只负责协议适配与流式归一化。 */
export interface ChatProvider {
  readonly capabilities: ProviderCapabilities;
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
}
