/**
 * 事件工厂：补齐事件信封的 id、时间戳与版本。
 */

import { randomUUID } from 'node:crypto';
import type { EventPayloadMap, NexusEvent, NexusEventType } from '@nexus/shared';

export interface CreateEventInput<T extends NexusEventType> {
  sessionId: string;
  runId?: string;
  seq: number;
  type: T;
  payload: EventPayloadMap[T];
}

/**
 * 构造不可变事件信封；runId 为空时不写入字段。
 */
export const createNexusEvent = <T extends NexusEventType>(
  input: CreateEventInput<T>
): NexusEvent<T> => {
  const base = {
    id: randomUUID(),
    sessionId: input.sessionId,
    seq: input.seq,
    type: input.type,
    version: 1,
    ts: Date.now(),
    payload: input.payload
  };

  return input.runId === undefined ? base : { ...base, runId: input.runId };
};
