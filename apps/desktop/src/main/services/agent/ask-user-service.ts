/**
 * Ask User 队列：主进程等待渲染进程回答 Agent 的结构化提问。
 */

import type { AskUserAnswer } from '@shared/ask-user';

interface PendingAskUser {
  runId: string;
  senderId: number;
  resolve: (answers: AskUserAnswer[] | undefined) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 管理等待中的问题；取消或超时返回 undefined。
 */
export class AskUserService {
  private readonly pending = new Map<string, PendingAskUser>();

  request(
    requestId: string,
    runId: string,
    senderId: number
  ): Promise<AskUserAnswer[] | undefined> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(undefined);
      }, DEFAULT_TIMEOUT_MS);

      this.pending.set(requestId, { runId, senderId, resolve, timer });
    });
  }

  resolve(requestId: string, answers: AskUserAnswer[] | undefined, senderId: number): boolean {
    const item = this.pending.get(requestId);
    if (!item || item.senderId !== senderId) return false;

    clearTimeout(item.timer);
    this.pending.delete(requestId);
    item.resolve(answers);
    return true;
  }

  cancelRun(runId: string): void {
    for (const [requestId, item] of this.pending) {
      if (item.runId !== runId) continue;
      clearTimeout(item.timer);
      this.pending.delete(requestId);
      item.resolve(undefined);
    }
  }
}

/**
 * 主进程共享的 Ask User 队列。
 */
export const askUserService = new AskUserService();
