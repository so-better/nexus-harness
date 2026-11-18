/**
 * 活跃 Run 注册表测试：会话互斥与注销。
 */

import { describe, expect, it } from 'vitest';
import {
  getRun,
  getRunForSession,
  hasActiveRuns,
  hasRunForSession,
  registerRun,
  unregisterRun
} from './run-registry';

describe('run registry', () => {
  it('registers and queries runs', () => {
    const run = {
      runId: 'run-1',
      sessionId: 'session-1',
      senderId: 1,
      controller: new AbortController()
    };
    registerRun(run);

    expect(getRun('run-1')).toBe(run);
    expect(getRunForSession('session-1')).toBe(run);
    expect(hasRunForSession('session-1')).toBe(true);
    expect(hasActiveRuns()).toBe(true);

    unregisterRun('run-1');
    expect(hasActiveRuns()).toBe(false);
    expect(hasRunForSession('session-1')).toBe(false);
  });

  it('rejects a second run in the same session', () => {
    registerRun({
      runId: 'run-1',
      sessionId: 'session-1',
      senderId: 1,
      controller: new AbortController()
    });

    expect(() =>
      registerRun({
        runId: 'run-2',
        sessionId: 'session-1',
        senderId: 2,
        controller: new AbortController()
      })
    ).toThrow('SESSION_BUSY');

    unregisterRun('run-1');
  });
});
