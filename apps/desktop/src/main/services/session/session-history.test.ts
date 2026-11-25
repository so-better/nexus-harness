/**
 * 会话历史投影测试：用户、助手、工具调用与审批状态重建。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import type { ArtifactService } from '../artifacts/artifact-service';
import type { EventStore } from './event-store';
import { SessionHistoryService } from './session-history';

describe('SessionHistoryService', () => {
  it('rebuilds user, assistant, tool and approval messages', async () => {
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
        payload: {
          messageId: 'assistant-1',
          role: 'assistant',
          content: '',
          reasoning: '先读取工具结果'
        }
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
    const history = await new SessionHistoryService(store).load('session-1');

    expect(history).toHaveLength(4);
    expect(history[0]).toMatchObject({ role: 'user', content: '读取文件' });
    expect(history[1]).toMatchObject({ reasoning: '先读取工具结果' });
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

  it('reuses the latest compaction snapshot and appends newer events', async () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'old', role: 'user', content: '旧历史' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 2,
        type: 'context.compacted',
        payload: {
          beforeTokens: 1000,
          afterTokens: 100,
          strategy: 'summarized',
          snapshotRef: 'snapshot-1'
        }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 3,
        type: 'message.completed',
        payload: { messageId: 'new', role: 'user', content: '新问题' }
      })
    ] as NexusEvent[];
    const store = { list: () => events } as unknown as EventStore;
    const artifacts = {
      read: async () => ({
        artifactId: 'snapshot-1',
        label: 'context-history',
        bytes: 1,
        content: JSON.stringify([{ role: 'user', content: '压缩后的历史' }])
      })
    } as unknown as ArtifactService;

    const history = await new SessionHistoryService(store, artifacts).load('session-1');

    expect(history).toEqual([
      { role: 'user', content: '压缩后的历史' },
      { role: 'user', content: '新问题' }
    ]);
  });

  it('does not reuse a snapshot invalidated by a later message edit', async () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'old', role: 'user', content: '旧历史' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 2,
        type: 'context.compacted',
        payload: {
          beforeTokens: 1000,
          afterTokens: 100,
          strategy: 'summarized',
          snapshotRef: 'snapshot-1'
        }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 3,
        type: 'message.edited',
        payload: { messageId: 'old', content: '修改后的问题' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 4,
        type: 'message.completed',
        payload: { messageId: 'new', role: 'user', content: '新问题' }
      })
    ] as NexusEvent[];
    const store = { list: () => events } as unknown as EventStore;
    const artifacts = {
      read: async () => ({
        artifactId: 'snapshot-1',
        label: 'context-history',
        bytes: 1,
        content: JSON.stringify([{ role: 'user', content: '压缩后的历史' }])
      })
    } as unknown as ArtifactService;

    const history = await new SessionHistoryService(store, artifacts).load('session-1');

    expect(history).toEqual([
      { role: 'user', content: '旧历史' },
      { role: 'user', content: '新问题' }
    ]);
  });

  it('stops before a branch message and ignores superseded branches', async () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '旧问题' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '旧回答' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 3,
        type: 'message.superseded',
        payload: { messageId: 'user-1', reason: 'edited' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 4,
        type: 'message.superseded',
        payload: { messageId: 'assistant-1', reason: 'edited' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        seq: 5,
        type: 'message.completed',
        payload: { messageId: 'user-2', role: 'user', content: '新问题' }
      })
    ] as NexusEvent[];

    const store = { list: () => events } as unknown as EventStore;
    const service = new SessionHistoryService(store);
    expect(await service.load('session-1')).toEqual([{ role: 'user', content: '新问题' }]);
    expect(await service.load('session-1', 'user-2')).toEqual([]);
  });

  it('rehydrates image references from user messages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexus-history-image-'));
    const imagePath = join(root, 'photo.png');
    await writeFile(imagePath, Buffer.from([1, 2, 3]));
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: {
          messageId: 'user-1',
          role: 'user',
          content: '看图',
          images: [{ path: imagePath, mime: 'image/png' }]
        }
      })
    ] as NexusEvent[];

    try {
      const store = { list: () => events } as unknown as EventStore;
      const history = await new SessionHistoryService(store).load('session-1');
      expect(history[0]?.images).toEqual([{ mimeType: 'image/png', data: 'AQID' }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('adds a placeholder result for an interrupted tool call', async () => {
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
    const history = await new SessionHistoryService(store).load('session-1');

    expect(history.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-1'
    });
    expect(history.at(-1)?.content).toContain('TOOL_RESULT_MISSING');
  });

  it('appends structured file references to replayed user messages', async () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: {
          messageId: 'user-1',
          role: 'user',
          content: '看这个',
          references: [{ path: '/workspace/a.ts', name: 'a.ts' }]
        }
      })
    ] as NexusEvent[];

    const store = { list: () => events } as unknown as EventStore;
    const history = await new SessionHistoryService(store).load('session-1');

    expect(history[0]).toMatchObject({
      role: 'user',
      content: '看这个\n\n@/workspace/a.ts'
    });
  });

  it('skips subagent events when rebuilding parent history', async () => {
    const events = [
      createNexusEvent({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '父会话问题' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 2,
        type: 'message.completed',
        parentToolCallId: 'task-1',
        payload: { messageId: 'child-1', role: 'assistant', content: '子代理内部内容' }
      })
    ] as NexusEvent[];

    const store = { list: () => events } as unknown as EventStore;
    const history = await new SessionHistoryService(store).load('session-1');

    expect(history).toEqual([{ role: 'user', content: '父会话问题' }]);
  });
});
