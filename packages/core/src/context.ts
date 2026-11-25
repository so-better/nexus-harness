/**
 * 上下文预算与 token 估算：供 Agent 循环在每次模型调用前判断是否压缩。
 */

import type { ChatMessage, ToolSchema } from '@nexus/providers';
import type { UsageSummary } from '@nexus/shared';

/**
 * 默认上下文窗口与输出预留，Provider 未显式配置时使用。
 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

/**
 * 预算计算参数；安全余量按窗口比例计算，并保底 512 token。
 */
export interface ContextBudgetOptions {
  contextWindow: number;
  maxOutputTokens?: number;
  safetyRatio?: number;
  compactThreshold?: number;
}

/**
 * 实际生效的预算：可用输入 token 与自动压缩触发线。
 */
export interface ContextBudget {
  contextWindow: number;
  maxOutputTokens: number;
  safetyTokens: number;
  inputBudget: number;
  compactAt: number;
}

/**
 * 上下文准备结果；由宿主实现压缩与产物落盘。
 */
export interface ContextPreparation {
  messages: ChatMessage[];
  compacted?: boolean;
  beforeTokens?: number;
  afterTokens?: number;
  strategies?: string[];
  summaryRef?: string;
  snapshotRef?: string;
  artifactIds?: string[];
  usage?: UsageSummary;
}

/**
 * 在每次模型调用前准备消息；失败会中止 Run。
 * actualInputTokens 为上一次模型调用返回的真实输入 token，用于校准字符估算。
 */
export type ContextPreparer = (
  messages: ChatMessage[],
  actualInputTokens?: number
) => Promise<ContextPreparation>;

/**
 * 上下文无法压入预算时抛出，交由 Agent 循环转为 run.failed。
 */
export class ContextLimitError extends Error {
  readonly code = 'CONTEXT_LIMIT_EXCEEDED';

  constructor(message: string) {
    super(message);
    this.name = 'ContextLimitError';
  }
}

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * 计算输入预算：窗口减去输出预留与安全余量。
 */
export const createContextBudget = (options: ContextBudgetOptions): ContextBudget => {
  if (!isPositiveFinite(options.contextWindow)) {
    throw new Error('contextWindow 必须为正数');
  }

  const contextWindow = Math.floor(options.contextWindow);
  const maxOutputTokens = Math.floor(
    Math.min(options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS, contextWindow - 1)
  );
  const safetyRatio = options.safetyRatio ?? 0.05;
  const safetyTokens = Math.max(512, Math.ceil(contextWindow * safetyRatio));
  const inputBudget = Math.max(1, contextWindow - maxOutputTokens - safetyTokens);
  const compactThreshold = options.compactThreshold ?? 0.7;

  return {
    contextWindow,
    maxOutputTokens,
    safetyTokens,
    inputBudget,
    compactAt: Math.max(1, Math.floor(inputBudget * compactThreshold))
  };
};

/**
 * CJK 与假名/韩文范围；这些字符按 1 字符 1 token 估算。
 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

/**
 * 粗略估算文本 token；CJK 按 1 字符 1 token，其他按 4 字符 1 token。
 */
export const estimateTextTokens = (text: string): number => {
  if (!text) return 0;
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  const otherCount = Math.max(0, text.length - cjkCount);
  return cjkCount + Math.ceil(otherCount / 4);
};

/**
 * 单条消息的 token 估算，包含角色、工具调用参数与 reasoning。
 */
export const estimateMessageTokens = (message: ChatMessage): number => {
  const toolCallTokens = message.toolCalls
    ? estimateTextTokens(JSON.stringify(message.toolCalls))
    : 0;
  const reasoningTokens = message.reasoning ? estimateTextTokens(message.reasoning) : 0;
  return 4 + estimateTextTokens(message.content) + reasoningTokens + toolCallTokens;
};

/**
 * 会回传 reasoning 的最近 assistant 消息条数，与 OpenAI 兼容协议保持一致的保守上界。
 */
export const MAX_REASONING_PASSBACK_MESSAGES = 8;

/**
 * 计算需要计入预算的 reasoning 下标：只取最近若干条带 reasoning 的 assistant 消息。
 * 更早的 reasoning 不会被回传，计入会高估上下文、导致不必要的压缩。
 */
const selectReasoningIndices = (messages: readonly ChatMessage[]): Set<number> => {
  const indices = new Set<number>();
  for (
    let index = messages.length - 1;
    index >= 0 && indices.size < MAX_REASONING_PASSBACK_MESSAGES;
    index -= 1
  ) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.reasoning?.trim()) indices.add(index);
  }
  return indices;
};

/**
 * 整段上下文与工具 schema 的 token 估算；reasoning 只计入会被回传的最近若干条。
 */
export const estimateMessagesTokens = (
  messages: readonly ChatMessage[],
  tools?: readonly ToolSchema[]
): number => {
  const reasoningIndices = selectReasoningIndices(messages);
  let messageTokens = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    const toolCallTokens = message.toolCalls
      ? estimateTextTokens(JSON.stringify(message.toolCalls))
      : 0;
    const reasoningTokens =
      reasoningIndices.has(index) && message.reasoning ? estimateTextTokens(message.reasoning) : 0;
    messageTokens += 4 + estimateTextTokens(message.content) + reasoningTokens + toolCallTokens;
  }
  const toolTokens = tools?.length ? estimateTextTokens(JSON.stringify(tools)) : 0;
  return messageTokens + toolTokens;
};
