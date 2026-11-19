/**
 * 会话导出内容测试：格式、脱敏与 HTML 转义。
 */

import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import type { SessionSummary } from '@shared/ipc/contracts';
import { describe, expect, it } from 'vitest';
import { buildSessionHtml, buildSessionMarkdown } from './export-service';

const session: SessionSummary = {
  id: 'session-1',
  title: '导出测试',
  titleSource: 'user',
  pinned: false,
  status: 'completed',
  mode: 'build',
  createdAt: 1,
  updatedAt: 2,
  lastActiveAt: 2
};

const events = [
  createNexusEvent({
    sessionId: 'session-1',
    runId: 'run-1',
    seq: 1,
    type: 'message.completed',
    payload: { messageId: 'm1', role: 'user', content: '请检查 key sk-1234567890123456' }
  }),
  createNexusEvent({
    sessionId: 'session-1',
    runId: 'run-1',
    seq: 2,
    type: 'tool.requested',
    payload: { toolCallId: 't1', name: 'run_command', input: { command: 'echo <hi>' } }
  })
] as NexusEvent[];

describe('session export', () => {
  it('builds markdown and redacts secrets', () => {
    const markdown = buildSessionMarkdown(session, events);
    expect(markdown).toContain('# 导出测试');
    expect(markdown).toContain('[REDACTED]');
    expect(markdown).not.toContain('sk-1234567890123456');
  });

  it('builds escaped standalone HTML', () => {
    const html = buildSessionHtml(session, events);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;hi&gt;');
    expect(html).not.toContain('<hi>');
  });

  it('includes approvals and usage while hiding superseded messages', () => {
    const extra = [
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: { messageId: 'old', role: 'assistant', content: '旧回复' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'message.superseded',
        payload: { messageId: 'old', reason: 'edited' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'approval.requested',
        payload: { approvalId: 'a1', toolCallId: 't1', scope: 'run_command' }
      }),
      createNexusEvent({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 6,
        type: 'usage.recorded',
        payload: {
          provider: 'mock',
          model: 'mock',
          inputTokens: 10,
          outputTokens: 5,
          cost: 0.001
        }
      })
    ] as NexusEvent[];
    const markdown = buildSessionMarkdown(session, [...events, ...extra]);
    expect(markdown).toContain('审批请求');
    expect(markdown).toContain('输入 token：10');
    expect(markdown).not.toContain('旧回复');
  });
});
