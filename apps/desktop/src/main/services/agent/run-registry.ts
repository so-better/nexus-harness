/**
 * 活跃 Run 注册表：约束每个 Session 同时最多一个 Run。
 */

export interface ActiveRun {
  runId: string;
  sessionId: string;
  senderId: number;
  controller: AbortController;
}

const activeRuns = new Map<string, ActiveRun>();

/**
 * 查询会话当前活跃 Run。
 */
export const getRunForSession = (sessionId: string): ActiveRun | undefined =>
  [...activeRuns.values()].find((run) => run.sessionId === sessionId);

/**
 * 判断会话是否已有运行中的 Run。
 */
export const hasRunForSession = (sessionId: string): boolean =>
  getRunForSession(sessionId) !== undefined;

/**
 * 是否存在任意活跃 Run。
 */
export const hasActiveRuns = (): boolean => activeRuns.size > 0;

/** 是否存在除当前 Run 之外的其他活跃 Run。 */
export const hasOtherActiveRuns = (runId?: string): boolean =>
  [...activeRuns.values()].some((run) => run.runId !== runId);

/**
 * 按 runId 查询活跃 Run。
 */
export const getRun = (runId: string): ActiveRun | undefined => activeRuns.get(runId);

/**
 * 注册新 Run；会话已有 Run 时拒绝。
 */
export const registerRun = (run: ActiveRun): void => {
  if (hasRunForSession(run.sessionId)) throw new Error('SESSION_BUSY');
  activeRuns.set(run.runId, run);
};

/**
 * 注销 Run。
 */
export const unregisterRun = (runId: string): void => {
  activeRuns.delete(runId);
};
