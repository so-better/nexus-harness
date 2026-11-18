/**
 * Run 状态机单元测试：合法迁移与非法迁移。
 */

import { describe, expect, it } from 'vitest';
import { assertRunTransition, canTransitionRun, InvalidRunTransitionError } from './run-state';

describe('run state', () => {
  it('allows valid transitions', () => {
    expect(canTransitionRun('queued', 'running')).toBe(true);
    expect(canTransitionRun('running', 'waiting_user')).toBe(true);
    expect(canTransitionRun('waiting_approval', 'running')).toBe(true);
    expect(canTransitionRun('running', 'succeeded')).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    expect(canTransitionRun('succeeded', 'running')).toBe(false);
    expect(canTransitionRun('cancelled', 'failed')).toBe(false);
  });

  it('throws on invalid transitions', () => {
    expect(() => assertRunTransition('queued', 'succeeded')).toThrow(InvalidRunTransitionError);
  });
});
