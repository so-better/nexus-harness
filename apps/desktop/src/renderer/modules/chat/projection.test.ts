/**
 * 聊天事件投影测试：消息、工具、审批与用量。
 */

import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import { projectEvents } from './projection';

const event = (input: Omit<NexusEvent, 'id' | 'version' | 'ts'>): NexusEvent =>
  ({ ...input, id: `event-${input.seq}`, version: 1, ts: input.seq }) as NexusEvent;

describe('projectEvents', () => {
  it('merges message deltas into one completed message', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '你' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '好' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '你好' }
      })
    ]);

    expect(projection.messages).toHaveLength(1);
    expect(projection.messages[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: '你好',
      streaming: false
    });
  });

  it('marks interrupted streaming content as interrupted', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'run.started',
        payload: { model: 'mock-model' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '部分内容' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'run.interrupted',
        payload: { reason: 'app_restart' }
      })
    ]);

    expect(projection.status).toBe('interrupted');
    expect(projection.messages[0]).toMatchObject({
      id: 'assistant-1',
      content: '部分内容',
      streaming: false
    });
  });

  it('projects messages, tool calls, approvals and usage', () => {
    const events: NexusEvent[] = [
      event({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '读取文件' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'run.started',
        payload: { model: 'mock-model' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'tool.requested',
        payload: { toolCallId: 'call-1', name: 'read_file', input: { path: 'a.txt' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'approval.requested',
        payload: { approvalId: 'approval-1', toolCallId: 'call-1', scope: 'read_file' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 6,
        type: 'approval.resolved',
        payload: { approvalId: 'approval-1', decision: 'approved' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 7,
        type: 'tool.completed',
        payload: { toolCallId: 'call-1', ok: true, output: 'hello' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 8,
        type: 'usage.recorded',
        payload: {
          provider: 'mock',
          model: 'mock-model',
          inputTokens: 10,
          outputTokens: 5,
          cost: 0.1
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 9,
        type: 'context.compacted',
        payload: { beforeTokens: 100, afterTokens: 40, strategy: 'summarized' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 10,
        type: 'run.completed',
        payload: { durationMs: 10 }
      })
    ];

    const projection = projectEvents(events);

    expect(projection.messages).toHaveLength(3);
    expect(projection.messages[0]).toMatchObject({ role: 'user', content: '读取文件' });
    expect(projection.messages[1]?.toolCalls[0]).toMatchObject({
      id: 'call-1',
      status: 'succeeded',
      output: 'hello'
    });
    expect(projection.messages[2]).toMatchObject({ role: 'system' });
    expect(projection.approvals[0]?.status).toBe('approved');
    expect(projection.usage).toEqual({ inputTokens: 10, outputTokens: 5, cost: 0.1 });
    expect(projection.status).toBe('completed');
    expect(projection.running).toBe(false);
  });
});
