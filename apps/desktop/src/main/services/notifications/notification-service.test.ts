/**
 * 后台通知测试：前台静默、审批提醒与点击激活会话。
 */

import { createNexusEvent } from '@nexus/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  focused: false,
  hasWindow: true,
  emit: vi.fn(),
  show: vi.fn(),
  click: undefined as (() => void) | undefined,
  send: vi.fn(),
  focus: vi.fn()
}));

vi.mock('electron', () => {
  class Notification {
    static isSupported = (): boolean => true;
    constructor(public options: { title: string; body: string }) {}
    on(event: string, handler: () => void): void {
      if (event === 'click') state.click = handler;
    }
    show(): void {
      state.show(this.options);
    }
  }
  return {
    app: { dock: { setBadge: vi.fn() }, emit: state.emit },
    BrowserWindow: {
      getFocusedWindow: () => (state.focused ? { isFocused: () => true } : null),
      getAllWindows: () =>
        state.hasWindow
          ? [
              {
                isFocused: () => state.focused,
                isMinimized: () => false,
                restore: vi.fn(),
                show: vi.fn(),
                focus: state.focus,
                webContents: { send: state.send, isDestroyed: () => false }
              }
            ]
          : []
    },
    Notification
  };
});

import { consumePendingSession, notifyAgentEvent } from './notification-service';

describe('notification service', () => {
  beforeEach(() => {
    state.focused = false;
    state.hasWindow = true;
    state.emit.mockReset();
    consumePendingSession();
    state.show.mockReset();
    state.send.mockReset();
    state.focus.mockReset();
    state.click = undefined;
  });

  it('does not notify while the window is focused', () => {
    state.focused = true;
    notifyAgentEvent(
      createNexusEvent({
        sessionId: 'session-1',
        type: 'approval.requested',
        seq: 1,
        payload: { approvalId: 'a1', toolCallId: 't1', scope: 'run_command' }
      }),
      '测试会话'
    );
    expect(state.show).not.toHaveBeenCalled();
  });

  it('shows an approval notification and activates the session on click', () => {
    notifyAgentEvent(
      createNexusEvent({
        sessionId: 'session-1',
        type: 'approval.requested',
        seq: 1,
        payload: { approvalId: 'a1', toolCallId: 't1', scope: 'run_command' }
      }),
      '测试会话'
    );
    expect(state.show).toHaveBeenCalledWith(expect.objectContaining({ title: '等待审批' }));
    state.click?.();
    expect(state.send).toHaveBeenCalledWith('session:activate', 'session-1');
  });

  it('queues the session and activates the app when no window exists', () => {
    state.hasWindow = false;
    notifyAgentEvent(
      createNexusEvent({
        sessionId: 'session-restore',
        type: 'run.completed',
        seq: 1,
        payload: { durationMs: 1 }
      }),
      '待恢复会话'
    );
    state.click?.();
    expect(state.emit).toHaveBeenCalledWith('activate');
    expect(consumePendingSession()).toBe('session-restore');
  });
});
