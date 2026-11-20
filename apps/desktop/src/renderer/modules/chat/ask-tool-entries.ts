/**
 * 消息时间线：把 ask_user 工具调用与提问按出现顺序配对，保证问答卡留在原始位置。
 */

import type { ChatAskUser, ChatToolCall } from './types';

/**
 * 时间线条目：普通工具调用或已配对的提问。
 */
export type ToolEntry =
  | { kind: 'tool'; tool: ChatToolCall }
  | { kind: 'ask'; tool: ChatToolCall; ask: ChatAskUser };

/**
 * 用问题 id 与文本生成指纹，处理未写入 toolCallId 的旧事件。
 */
const questionKey = (questions: unknown): string => {
  if (!Array.isArray(questions)) return '';
  return questions
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const question = item as { id?: unknown; question?: unknown };
      return `${String(question.id)}\u0000${String(question.question)}`;
    })
    .join('\u0001');
};

/**
 * 生成按工具调用顺序排列的时间线条目。
 * 优先使用显式 toolCallId；旧事件按问题指纹配对，最后按顺序回退。
 */
export const buildToolEntries = (
  toolCalls: ChatToolCall[],
  askUsers: ChatAskUser[]
): ToolEntry[] => {
  const usedAskIds = new Set<string>();
  const entries: ToolEntry[] = [];

  for (const tool of toolCalls) {
    if (tool.name === 'save_file') continue;
    if (tool.name !== 'ask_user') {
      entries.push({ kind: 'tool', tool });
      continue;
    }

    const toolQuestions = (tool.input as { questions?: unknown } | undefined)?.questions;
    const key = questionKey(toolQuestions);
    const ask =
      askUsers.find((item) => item.toolCallId === tool.id && !usedAskIds.has(item.requestId)) ??
      askUsers.find(
        (item) => !usedAskIds.has(item.requestId) && questionKey(item.questions) === key
      ) ??
      askUsers.find((item) => !item.toolCallId && !usedAskIds.has(item.requestId)) ??
      askUsers.find((item) => !usedAskIds.has(item.requestId));

    if (!ask) {
      entries.push({ kind: 'tool', tool });
      continue;
    }

    usedAskIds.add(ask.requestId);
    entries.push({ kind: 'ask', tool, ask });
  }

  return entries;
};

/**
 * 未被任何工具调用配对的提问；用于旧数据或工具调用缺失时的兜底展示。
 */
export const unmatchedAskUsers = (
  entries: ToolEntry[],
  askUsers: ChatAskUser[]
): ChatAskUser[] => {
  const matched = new Set(
    entries.flatMap((entry) => (entry.kind === 'ask' ? [entry.ask.requestId] : []))
  );
  return askUsers.filter((ask) => !matched.has(ask.requestId));
};
