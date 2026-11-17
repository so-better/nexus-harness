/* EventBus 单元测试：订阅、取消订阅、错误隔离。 */

import type { NexusEvent } from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus';

const createEvent = (title: string): NexusEvent<'session.created'> => ({
  id: `event-${title}`,
  sessionId: 'session-1',
  seq: 1,
  type: 'session.created',
  version: 1,
  ts: Date.now(),
  payload: { title }
});

describe('EventBus', () => {
  it('publishes to subscribers and supports unsubscribe', () => {
    const bus = new EventBus(() => undefined);
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('session.created', handler);

    bus.publish(createEvent('first'));
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.publish(createEvent('second'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('notifies all-event subscribers', () => {
    const bus = new EventBus(() => undefined);
    const handler = vi.fn();
    const unsubscribe = bus.subscribeAll(handler);

    bus.publish(createEvent('all'));
    unsubscribe();
    bus.publish(createEvent('after'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('isolates subscriber errors', () => {
    const onError = vi.fn();
    const bus = new EventBus(onError);
    const healthy = vi.fn();

    bus.subscribe('session.created', () => {
      throw new Error('boom');
    });
    bus.subscribe('session.created', healthy);

    bus.publish(createEvent('event'));

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
