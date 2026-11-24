/**
 * 会话历史的工具恢复策略：只取最近若干用户轮内用过的工具，避免长会话里历史工具无限累积。
 */

import type { ChatMessage } from '@nexus/providers';

/**
 * 收集最近 recentTurns 个用户轮内出现过的工具名。
 * 从历史末尾向前扫描，遇到第 recentTurns 个用户消息即停止，只统计更新轮次里的工具调用。
 */
export const collectRecentUsedToolNames = (
  history: readonly ChatMessage[],
  recentTurns: number
): Set<string> => {
  const names = new Set<string>();
  if (recentTurns <= 0) return names;

  let turns = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    if (message.role === 'user') {
      turns += 1;
      if (turns >= recentTurns) break;
      continue;
    }
    for (const call of message.toolCalls ?? []) names.add(call.name);
  }
  return names;
};
