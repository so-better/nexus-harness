/**
 * 启动恢复：把中断 Run 中未决的审批写成过期事件。
 */

import { createNexusEvent } from '@nexus/core';
import type { EventPayloadMap } from '@shared/events';
import type { EventStore } from './event-store';

/**
 * 为指定 Run 的未决审批追加过期事件；已处理的审批保持不变。
 */
export const expirePendingApprovals = (
  eventStore: Pick<EventStore, 'list' | 'append'>,
  run: { id: string; session_id: string }
): void => {
  const events = eventStore.list(run.session_id);
  const resolved = new Set(
    events
      .filter((event) => event.type === 'approval.resolved')
      .map((event) => (event.payload as EventPayloadMap['approval.resolved']).approvalId)
  );

  for (const event of events) {
    if (event.type !== 'approval.requested' || event.runId !== run.id) continue;
    const payload = event.payload as EventPayloadMap['approval.requested'];
    if (resolved.has(payload.approvalId)) continue;
    eventStore.append(
      createNexusEvent({
        sessionId: run.session_id,
        runId: run.id,
        seq: 1,
        type: 'approval.resolved',
        payload: {
          approvalId: payload.approvalId,
          decision: 'expired',
          reason: 'app_restart'
        }
      })
    );
  }
};
