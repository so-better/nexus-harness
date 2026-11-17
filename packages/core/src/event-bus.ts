/* 进程内事件总线：发布领域事件，订阅者只做观察，不修改事件。 */

import type { NexusEvent, NexusEventType } from '@nexus/shared';

type AnyEventHandler = (event: NexusEvent) => void;

/* 事件总线的最小实现；持久化事件流由上层负责。 */
export class EventBus {
  private readonly handlers = new Map<NexusEventType, Set<AnyEventHandler>>();
  private readonly onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) {
    this.onError = onError;
  }

  /* 订阅指定事件，返回取消订阅函数。 */
  subscribe<T extends NexusEventType>(
    type: T,
    handler: (event: NexusEvent<T>) => void
  ): () => void {
    const wrapped: AnyEventHandler = (event) => {
      // type 已限定订阅键，payload 与事件类型在此处保持同构
      handler(event as NexusEvent<T>);
    };

    let bucket = this.handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(type, bucket);
    }
    bucket.add(wrapped);

    return () => {
      bucket?.delete(wrapped);
      if (bucket?.size === 0) this.handlers.delete(type);
    };
  }

  /* 同步发布事件；单个订阅者异常不影响其他订阅者。 */
  publish<T extends NexusEventType>(event: NexusEvent<T>): void {
    const bucket = this.handlers.get(event.type);
    if (!bucket) return;

    for (const handler of [...bucket]) {
      try {
        handler(event as NexusEvent);
      } catch (error) {
        this.onError(error);
      }
    }
  }

  /* 清空所有订阅。 */
  clear(): void {
    this.handlers.clear();
  }
}
