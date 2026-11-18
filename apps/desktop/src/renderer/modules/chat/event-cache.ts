/**
 * 会话事件缓存：把实时事件写入对应会话，并维护 Run 状态。
 */

import type { NexusEvent } from '@shared/events';

/**
 * 追加事件并更新运行状态；会话未选中时也保留缓存。
 */
export const appendAgentEvent = (
  eventsBySession: Record<string, NexusEvent[]>,
  runningBySession: Record<string, boolean>,
  runIds: Record<string, string>,
  event: NexusEvent
): void => {
  const list = eventsBySession[event.sessionId] ?? [];
  list.push(event);
  eventsBySession[event.sessionId] = list;

  if (event.type === 'run.started') {
    runningBySession[event.sessionId] = true;
    if (event.runId) runIds[event.sessionId] = event.runId;
  } else if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled' ||
    event.type === 'run.interrupted'
  ) {
    runningBySession[event.sessionId] = false;
    delete runIds[event.sessionId];
  }
};
