/**
 * Ask User 回显卡片的索引：按消息 id 关联，同一消息保留全部提问。
 */

import type { ChatAskUser } from './types';

/**
 * 构建 messageId → AskUser[] 的映射，忽略尚未关联消息的提问。
 */
export const indexAskUsersByMessage = (
  askUsers: readonly ChatAskUser[]
): Map<string, ChatAskUser[]> => {
  const result = new Map<string, ChatAskUser[]>();
  for (const ask of askUsers) {
    if (!ask.messageId) continue;
    result.set(ask.messageId, [...(result.get(ask.messageId) ?? []), ask]);
  }
  return result;
};
