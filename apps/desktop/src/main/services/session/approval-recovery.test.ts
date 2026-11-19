/**
 * 启动审批恢复测试：未决审批过期，已处理审批保持。
 */

import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import { expirePendingApprovals } from './approval-recovery';
import type { EventStore } from './event-store';

describe('expirePendingApprovals', () => {
  it('expires unresolved approvals for the interrupted run only', () => {
    const events: NexusEvent[] = [
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'approval.requested',
        payload: { approvalId: 'pending', toolCallId: 'call-1', scope: 'run_command' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'approval.requested',
        payload: { approvalId: 'resolved', toolCallId: 'call-2', scope: 'write_file' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'approval.resolved',
        payload: { approvalId: 'resolved', decision: 'approved' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-2',
        seq: 4,
        type: 'approval.requested',
        payload: { approvalId: 'other-run', toolCallId: 'call-3', scope: 'run_command' }
      })
    ];
    const appended: NexusEvent[] = [];
    const store = {
      list: () => events,
      append: (event: NexusEvent) => {
        appended.push(event);
        return event;
      }
    } as Pick<EventStore, 'list' | 'append'>;

    expirePendingApprovals(store, { id: 'run-1', session_id: 'session-1' });

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: 'approval.resolved',
      runId: 'run-1',
      payload: { approvalId: 'pending', decision: 'expired', reason: 'app_restart' }
    });
  });
});
