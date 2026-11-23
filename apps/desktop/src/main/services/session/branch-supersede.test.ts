/**
 * 分支清理测试：completed、流式增量和工具占位消息都必须被覆盖。
 */
import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import { collectSupersededMessageIds } from './branch-supersede';

describe('collectSupersededMessageIds', () => {
  it('collects completed, streamed and placeholder messages', () => {
    const events = [
      createNexusEvent({
        sessionId: 's',
        seq: 1,
        type: 'message.reasoning.delta',
        payload: { messageId: 'aborted-reasoning', text: '...' }
      }),
      createNexusEvent({
        sessionId: 's',
        seq: 2,
        type: 'message.completed',
        payload: { messageId: 'assistant-final', role: 'assistant', content: 'done' }
      }),
      createNexusEvent({
        sessionId: 's',
        seq: 3,
        type: 'tool.requested',
        payload: { toolCallId: 'call-1', name: 'save_file', input: {} }
      }),
      createNexusEvent({
        sessionId: 's',
        seq: 4,
        type: 'file.created',
        payload: {
          fileId: 'file-1',
          name: 'page.html',
          mime: 'text/html',
          bytes: 10,
          source: 'generated'
        }
      })
    ] as NexusEvent[];

    const ids = collectSupersededMessageIds(events);

    expect(ids).toEqual(
      new Set([
        'aborted-reasoning',
        'assistant-final',
        `assistant-${events[2]?.id}`,
        `assistant-${events[3]?.id}`
      ])
    );
  });
});
