/* 上下文预算与 token 估算：供 Agent 循环在每次模型调用前判断是否压缩。 */

import type { ChatMessage, ToolSchema } from '@nexus/providers';
import type { UsageSummary } from '@nexus/shared';

/* 默认上下文窗口与输出预留，Provider 未显式配置时使用。 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/* 预算计算参数；安全余量按窗口比例计算，并保底 512 token。 */
export interface ContextBudgetOptions {
  contextWindow: number;
  maxOutputTokens?: number;
  safetyRatio?: number;
  compactThreshold?: number;
}

/* 实际生效的预算：可用输入 token 与自动压缩触发线。 */
export interface ContextBudget {
  contextWindow: number;
  maxOutputTokens: number;
  safetyTokens: number;
  inputBudget: number;
  compactAt: number;
}

/* 上下文准备结果；由宿主实现压缩与产物落盘。 */
export interface ContextPreparation {
  messages: ChatMessage[];
  compacted?: boolean;
  beforeTokens?: number;
  afterTokens?: number;
  strategies?: string[];
  summaryRef?: string;
  artifactIds?: string[];
  usage?: UsageSummary;
}

/* 在每次模型调用前准备消息；失败会中止 Run。 */
export type ContextPreparer = (messages: ChatMessage[]) => Promise<ContextPreparation>;

/* 上下文无法压入预算时抛出，交由 Agent 循环转为 run.failed。 */
export class ContextLimitError extends Error {
  readonly code = 'CONTEXT_LIMIT_EXCEEDED';

  constructor(message: string) {
    super(message);
    this.name = 'ContextLimitError';
  }
}

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

/* 计算输入预算：窗口减去输出预留与安全余量。 */
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

/* CJK 与假名/韩文范围；这些字符按 1 字符 1 token 估算。 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;

/* 粗略估算文本 token；CJK 按 1 字符 1 token，其他按 4 字符 1 token。 */
export const estimateTextTokens = (text: string): number => {
  if (!text) return 0;
  const cjkCount = text.match(CJK_PATTERN)?.length ?? 0;
  const otherCount = Math.max(0, text.length - cjkCount);
  return cjkCount + Math.ceil(otherCount / 4);
};

/* 单条消息的 token 估算，包含角色与工具调用参数开销。 */
export const estimateMessageTokens = (message: ChatMessage): number => {
  const toolCallTokens = message.toolCalls
    ? estimateTextTokens(JSON.stringify(message.toolCalls))
    : 0;
  return 4 + estimateTextTokens(message.content) + toolCallTokens;
};

/* 整段上下文与工具 schema 的 token 估算。 */
export const estimateMessagesTokens = (
  messages: readonly ChatMessage[],
  tools?: readonly ToolSchema[]
): number => {
  const messageTokens = messages.reduce(
    (total, message) => total + estimateMessageTokens(message),
    0
  );
  const toolTokens = tools?.length ? estimateTextTokens(JSON.stringify(tools)) : 0;
  return messageTokens + toolTokens;
};
