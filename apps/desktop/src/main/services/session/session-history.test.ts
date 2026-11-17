/* 会话历史投影测试：用户、助手、工具调用与审批状态重建。 */

import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import type { EventStore } from './event-store';
import { SessionHistoryService } from './session-history';

describe('SessionHistoryService', () => {
  it('rebuilds user, assistant, tool and approval messages', () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '读取文件' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'tool.requested',
        payload: { toolCallId: 'call-1', name: 'read_file', input: { path: 'a.txt' } }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'approval.requested',
        payload: { approvalId: 'approval-1', toolCallId: 'call-1', scope: 'read_file' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'approval.resolved',
        payload: { approvalId: 'approval-1', decision: 'approved' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 6,
        type: 'tool.completed',
        payload: { toolCallId: 'call-1', ok: true, output: 'hello' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 7,
        type: 'message.completed',
        payload: { messageId: 'assistant-2', role: 'assistant', content: '读取完成' }
      })
    ] as NexusEvent[];

    const store = { list: () => events } as unknown as EventStore;
    const history = new SessionHistoryService(store).load('session-1');

    expect(history).toHaveLength(4);
    expect(history[0]).toMatchObject({ role: 'user', content: '读取文件' });
    expect(history[1]?.toolCalls?.[0]).toMatchObject({
      id: 'call-1',
      name: 'read_file',
      arguments: { path: 'a.txt' }
    });
    expect(history[2]).toMatchObject({
      role: 'tool',
      content: 'hello',
      approvalStatus: 'approved'
    });
    expect(history[3]).toMatchObject({ role: 'assistant', content: '读取完成' });
  });

  it('adds a placeholder result for an interrupted tool call', () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '执行命令' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'tool.requested',
        payload: { toolCallId: 'call-1', name: 'run_command', input: { command: 'sleep 10' } }
      })
    ] as NexusEvent[];

    const store = { list: () => events } as unknown as EventStore;
    const history = new SessionHistoryService(store).load('session-1');

    expect(history.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1'
    });
    expect(history.at(-1)?.content).toContain('TOOL_RESULT_MISSING');
  });
});
