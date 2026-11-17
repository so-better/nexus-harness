/* Run 状态机：限制合法状态迁移，避免上层随意改写运行状态。 */

export const RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'waiting_user',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted'
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_approval', 'waiting_user', 'succeeded', 'failed', 'cancelled', 'interrupted'],
  waiting_approval: ['running', 'failed', 'cancelled', 'interrupted'],
  waiting_user: ['running', 'failed', 'cancelled', 'interrupted'],
  succeeded: [],
  failed: [],
  cancelled: [],
  interrupted: []
};

/* 判断状态迁移是否合法。 */
export const canTransitionRun = (from: RunStatus, to: RunStatus): boolean =>
  RUN_TRANSITIONS[from].includes(to);

/* 非法迁移时抛出，供状态变更入口调用。 */
export class InvalidRunTransitionError extends Error {
  constructor(
    readonly from: RunStatus,
    readonly to: RunStatus
  ) {
    super(`非法 Run 状态迁移：${from} → ${to}`);
    this.name = 'InvalidRunTransitionError';
  }
}

/* 断言状态迁移合法。 */
export const assertRunTransition = (from: RunStatus, to: RunStatus): void => {
  if (!canTransitionRun(from, to)) throw new InvalidRunTransitionError(from, to);
};
