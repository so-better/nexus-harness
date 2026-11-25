/**
 * 聊天事件投影测试：消息、工具、审批与用量。
 */

import type { NexusEvent } from '@shared/events';
import { describe, expect, it } from 'vitest';
import { clearSubagentProjectionCache, projectEvents } from './projection';

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

  it('expires pending approvals when a run is interrupted', () => {
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
        type: 'tool.requested',
        payload: { toolCallId: 'call-1', name: 'run_command', input: { command: 'ls' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'approval.requested',
        payload: { approvalId: 'approval-1', toolCallId: 'call-1', scope: 'run_command' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'run.interrupted',
        payload: { reason: 'app_restart' }
      })
    ]);

    expect(projection.approvals[0]?.status).toBe('expired');
    expect(projection.messages[0]?.toolCalls[0]?.status).toBe('expired');
  });

  it('keeps structured file references on user messages', () => {
    const projection = projectEvents([
      event({
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
    ]);

    expect(projection.messages[0]?.content).toBe('看这个');
    expect(projection.messages[0]?.references).toEqual([{ path: '/workspace/a.ts', name: 'a.ts' }]);
  });

  it('tracks pending Ask User questions until they are answered', () => {
    const questions = [
      {
        id: 'scope',
        question: '要处理哪个范围？',
        options: [
          { id: 'core', label: 'Core' },
          { id: 'desktop', label: 'Desktop' }
        ],
        required: true
      }
    ];
    const requested = projectEvents([
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
        type: 'ask_user.requested',
        payload: { requestId: 'ask-1', questions }
      })
    ]);

    expect(requested.status).toBe('waiting_user');
    expect(requested.askUsers[0]).toMatchObject({ requestId: 'ask-1', status: 'pending' });

    const resolved = projectEvents([
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
        type: 'ask_user.requested',
        payload: { requestId: 'ask-1', questions }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'ask_user.resolved',
        payload: {
          requestId: 'ask-1',
          answers: [{ questionId: 'scope', selectedOptionIds: ['core'] }],
          cancelled: false
        }
      })
    ]);

    expect(resolved.status).toBe('running');
    expect(resolved.askUsers[0]).toMatchObject({
      status: 'resolved',
      answers: [{ questionId: 'scope', selectedOptionIds: ['core'] }]
    });
  });

  it('merges an answered ask into the continuation assistant message', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'tool.requested',
        payload: { toolCallId: 'call-ask', name: 'ask_user', input: {} }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'ask_user.requested',
        payload: { requestId: 'ask-1', questions: [] }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'ask_user.resolved',
        payload: {
          requestId: 'ask-1',
          answers: [{ questionId: 'scope', selectedOptionIds: ['core'] }],
          cancelled: false
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'message.completed',
        payload: { messageId: 'assistant-2', role: 'assistant', content: '继续处理' }
      })
    ]);

    expect(projection.messages).toHaveLength(1);
    expect(projection.messages[0]).toMatchObject({ id: 'assistant-1', content: '继续处理' });
    expect(projection.askUsers[0]).toMatchObject({
      status: 'resolved',
      messageId: 'assistant-1'
    });
  });

  it('attaches created files to the latest assistant message', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '已生成' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'file.created',
        payload: {
          fileId: 'file-1',
          name: 'report.md',
          mime: 'text/markdown',
          bytes: 12,
          source: 'generated'
        }
      })
    ]);

    expect(projection.messages[0]?.files).toMatchObject([
      { id: 'file-1', name: 'report.md', source: 'generated' }
    ]);
  });

  it('hides superseded messages from the visible conversation', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        seq: 1,
        type: 'message.completed',
        payload: { messageId: 'user-1', role: 'user', content: '旧问题' }
      }),
      event({
        sessionId: 'session-1',
        seq: 2,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: '旧回答' }
      }),
      event({
        sessionId: 'session-1',
        seq: 3,
        type: 'message.superseded',
        payload: { messageId: 'user-1', reason: 'edited' }
      }),
      event({
        sessionId: 'session-1',
        seq: 4,
        type: 'message.superseded',
        payload: { messageId: 'assistant-1', reason: 'edited' }
      }),
      event({
        sessionId: 'session-1',
        seq: 5,
        type: 'message.completed',
        payload: { messageId: 'user-2', role: 'user', content: '新问题' }
      })
    ]);

    expect(projection.messages).toHaveLength(1);
    expect(projection.messages[0]).toMatchObject({ id: 'user-2', content: '新问题' });
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
    expect(projection.messages[2]).toMatchObject({
      role: 'system',
      compactionNotice: true
    });
    expect(projection.approvals[0]?.status).toBe('approved');
    expect(projection.usage).toEqual({ inputTokens: 10, outputTokens: 5, cost: 0.1 });
    expect(projection.messages.find((message) => message.id === 'assistant-1')?.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.1
    });
    expect(projection.status).toBe('completed');
    expect(projection.running).toBe(false);
  });

  it('shows only one meaningful compaction notice', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'context.compacted',
        payload: { beforeTokens: 100, afterTokens: 80, strategy: 'tool_output_truncated' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'context.compacted',
        payload: { beforeTokens: 120, afterTokens: 90, strategy: 'tool_output_truncated' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'context.compacted',
        payload: { beforeTokens: 140, afterTokens: 60, strategy: 'summarized' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'context.compacted',
        payload: { beforeTokens: 160, afterTokens: 70, strategy: 'summarized' }
      })
    ]);

    const notices = projection.messages.filter((message) => message.compactionNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.role).toBe('system');
    expect(notices[0]?.content).toContain('上下文较长');
    expect(notices[0]?.toolCalls).toEqual([]);
  });

  it('projects run failures as an assistant error bubble', () => {
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
        type: 'run.failed',
        payload: { error: { code: 'PROVIDER_UNAUTHORIZED', message: '认证失败' } }
      }),
      event({
        sessionId: 'session-1',
        seq: 3,
        type: 'message.completed',
        payload: {
          messageId: 'error-1',
          role: 'assistant',
          content: '认证失败\n\nPROVIDER_UNAUTHORIZED',
          error: true
        }
      })
    ]);

    expect(projection.status).toBe('failed');
    expect(projection.messages[0]).toMatchObject({
      role: 'assistant',
      content: '认证失败\n\nPROVIDER_UNAUTHORIZED'
    });
  });

  it('exposes the failure code and clears it on the next run', () => {
    const failed = projectEvents([
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
        type: 'run.failed',
        payload: { error: { code: 'RUN_MAX_STEPS', message: '已达最大执行步骤' } }
      })
    ]);

    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('RUN_MAX_STEPS');

    const continued = projectEvents([
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
        type: 'run.failed',
        payload: { error: { code: 'RUN_MAX_STEPS', message: '已达最大执行步骤' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-2',
        seq: 3,
        type: 'run.started',
        payload: { model: 'mock-model' }
      })
    ]);

    expect(continued.status).toBe('running');
    expect(continued.errorCode).toBeUndefined();
  });

  it('renders legacy run failures without message.completed', () => {
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
        type: 'run.failed',
        payload: { error: { code: 'PROVIDER_TIMEOUT', message: '请求超时' } }
      })
    ]);

    expect(projection.status).toBe('failed');
    expect(projection.messages[0]).toMatchObject({
      role: 'assistant',
      content: '请求超时\n\nPROVIDER_TIMEOUT'
    });
  });

  it('stores per-message duration and character count', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-stats',
          role: 'assistant',
          content: '你好😀',
          durationMs: 1234
        }
      })
    ]);

    expect(projection.messages[0]).toMatchObject({
      durationMs: 1234,
      // 按 Unicode 码点计数：你 / 好 / 😀 = 3
      contentChars: 3
    });
  });

  it('projects reasoning deltas onto the assistant message', () => {
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
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-1', text: '先分析' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-1',
          role: 'assistant',
          content: '答案',
          reasoning: '先分析'
        }
      })
    ]);

    expect(projection.messages[0]).toMatchObject({
      role: 'assistant',
      content: '答案',
      reasoning: '先分析'
    });
  });

  it('attaches usage arriving before the assistant message', () => {
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
        type: 'usage.recorded',
        payload: {
          messageId: 'assistant-1',
          provider: 'mock',
          model: 'mock-model',
          inputTokens: 10,
          outputTokens: 5
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: { messageId: 'assistant-1', role: 'assistant', content: 'ok' }
      })
    ]);

    expect(projection.messages[0]?.usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });
  it('按事件顺序生成助手时间线，推理与工具/提问交错', () => {
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
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-1', text: '先想一下' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '第一段回答' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-1',
          role: 'assistant',
          content: '第一段回答',
          reasoning: '先想一下'
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'tool.requested',
        payload: { toolCallId: 'tool-1', name: 'list_dir', input: {} }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 6,
        type: 'ask_user.requested',
        payload: { requestId: 'ask-1', questions: [{ id: 'q', question: '继续吗？' }] }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 7,
        type: 'ask_user.resolved',
        payload: { requestId: 'ask-1', answers: [], cancelled: false }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 8,
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-2', text: '继续思考' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 9,
        type: 'message.delta',
        payload: { messageId: 'assistant-2', text: '第二段回答' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 10,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-2',
          role: 'assistant',
          content: '第二段回答',
          reasoning: '继续思考'
        }
      })
    ]);

    const timeline = projection.messages[0]?.timeline ?? [];
    expect(timeline.map((segment) => segment.kind)).toEqual([
      'reasoning',
      'content',
      'tool',
      'ask',
      'reasoning',
      'content'
    ]);
    expect(timeline[0]).toMatchObject({ kind: 'reasoning', text: '先想一下' });
    expect(timeline[2]).toMatchObject({ kind: 'tool', toolCallId: 'tool-1' });
    expect(timeline[3]).toMatchObject({ kind: 'ask', requestId: 'ask-1' });
    expect(timeline[5]).toMatchObject({ kind: 'content', text: '第二段回答' });
  });
  it('完成事件用最终内容校正时间线段', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-1', text: '先' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '答' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-1',
          role: 'assistant',
          content: '答案',
          reasoning: '先想一下'
        }
      })
    ]);

    const timeline = projection.messages[0]?.timeline ?? [];
    expect(timeline[0]).toMatchObject({ kind: 'reasoning', text: '先想一下' });
    expect(timeline[1]).toMatchObject({ kind: 'content', text: '答案' });
  });
  it('同一步骤内晚到的推理不会割开正文', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-1', text: '先想' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '第一段' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'message.reasoning.delta',
        payload: { messageId: 'assistant-1', text: '再想' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'message.delta',
        payload: { messageId: 'assistant-1', text: '第二段' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'message.completed',
        payload: {
          messageId: 'assistant-1',
          role: 'assistant',
          content: '第一段第二段',
          reasoning: '先想再想'
        }
      })
    ]);

    const timeline = projection.messages[0]?.timeline ?? [];
    expect(timeline.map((segment) => segment.kind)).toEqual(['reasoning', 'content']);
    expect(timeline[0]).toMatchObject({ kind: 'reasoning', text: '先想再想' });
    expect(timeline[1]).toMatchObject({ kind: 'content', text: '第一段第二段' });
  });

  it('attaches subagent progress and summary to the task tool call', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'subagent.started',
        payload: { parentToolCallId: 'task-1', agent: 'explore' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'subagent.progress',
        payload: { parentToolCallId: 'task-1', name: 'grep' }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 4,
        type: 'subagent.progress',
        payload: { parentToolCallId: 'task-1', name: 'grep', ok: true }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 5,
        type: 'subagent.completed',
        payload: {
          parentToolCallId: 'task-1',
          agent: 'explore',
          ok: true,
          summary: '结论',
          steps: 2,
          toolCalls: 1
        }
      })
    ]);

    const tool = projection.messages
      .flatMap((message) => message.toolCalls)
      .find((item) => item.id === 'task-1');
    expect(tool?.subagent).toMatchObject({
      agent: 'explore',
      status: 'succeeded',
      summary: '结论',
      steps: 2,
      toolCalls: 1
    });
    expect(tool?.subagent?.progress).toHaveLength(1);
    expect(tool?.subagent?.progress[0]).toMatchObject({ name: 'grep', ok: true });
  });

  it('keeps subagent approval details and transcript reference', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'approval.requested',
        payload: {
          approvalId: 'approval-1',
          toolCallId: 'task-1',
          scope: 'subagent:write_file src/a.ts',
          toolName: 'write_file',
          input: { path: 'src/a.ts', oldText: 'a', newText: 'b' }
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'subagent.completed',
        payload: {
          parentToolCallId: 'task-1',
          agent: 'general',
          ok: true,
          summary: '完成',
          steps: 2,
          toolCalls: 1,
          transcriptRef: 'artifact-1',
          transcripts: [
            { index: 0, ref: 'artifact-0' },
            { index: 1, ref: 'artifact-1' }
          ]
        }
      })
    ]);

    expect(projection.approvals[0]).toMatchObject({
      toolName: 'write_file',
      input: { path: 'src/a.ts', oldText: 'a', newText: 'b' }
    });
    const tool = projection.messages
      .flatMap((message) => message.toolCalls)
      .find((item) => item.id === 'task-1');
    expect(tool?.subagent?.transcriptRef).toBe('artifact-1');
    expect(tool?.subagent?.transcripts).toHaveLength(2);
    expect(tool?.subagent?.transcripts?.[1]).toMatchObject({ index: 1, ref: 'artifact-1' });
  });

  it('keeps a task tool waiting while other subagent approvals are still pending', () => {
    const base = [
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'approval.requested',
        payload: {
          approvalId: 'a1',
          toolCallId: 'task-1',
          scope: 'subagent#1:write_file src/a.ts',
          toolName: 'write_file'
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
        type: 'approval.requested',
        payload: {
          approvalId: 'a2',
          toolCallId: 'task-1',
          scope: 'subagent#2:write_file src/b.ts',
          toolName: 'write_file'
        }
      })
    ];
    const resolvedOne = event({
      sessionId: 'session-1',
      runId: 'run-1',
      seq: 4,
      type: 'approval.resolved',
      payload: { approvalId: 'a1', decision: 'approved' }
    });
    const resolvedBoth = event({
      sessionId: 'session-1',
      runId: 'run-1',
      seq: 5,
      type: 'approval.resolved',
      payload: { approvalId: 'a2', decision: 'approved' }
    });

    const waiting = projectEvents([...base, resolvedOne]);
    const done = projectEvents([...base, resolvedOne, resolvedBoth]);
    const findTask = (projection: ReturnType<typeof projectEvents>) =>
      projection.messages
        .flatMap((message) => message.toolCalls)
        .find((item) => item.id === 'task-1');

    expect(findTask(waiting)?.status).toBe('waiting_approval');
    expect(findTask(done)?.status).toBe('approved');
  });

  it('does not attach subagent file events to the parent messages', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 2,
        type: 'file.created',
        payload: {
          fileId: 'file-1',
          name: 'a.txt',
          mime: 'text/plain',
          bytes: 1,
          source: 'generated',
          parentToolCallId: 'task-1'
        }
      })
    ]);

    expect(projection.messages.flatMap((message) => message.files ?? [])).toHaveLength(0);
  });

  it('nests child run events under the task tool without polluting parent messages', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 2,
        type: 'message.completed',
        parentToolCallId: 'task-1',
        payload: { messageId: 'child-msg-1', role: 'assistant', content: '子代理结论' }
      })
    ]);

    const tool = projection.messages
      .flatMap((message) => message.toolCalls)
      .find((item) => item.id === 'task-1');
    expect(tool?.subagent?.runs).toHaveLength(1);
    expect(tool?.subagent?.runs?.[0]?.projection.messages[0]).toMatchObject({
      content: '子代理结论'
    });
    expect(projection.messages.some((message) => message.content === '子代理结论')).toBe(false);
  });

  it('reuses the cached subagent projection while child events are unchanged', () => {
    const events = [
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '探索' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 2,
        type: 'message.completed',
        parentToolCallId: 'task-1',
        payload: { messageId: 'child-msg-1', role: 'assistant', content: '子代理结论' }
      })
    ];

    const first = projectEvents(events);
    const second = projectEvents(events);
    const findRun = (projection: ReturnType<typeof projectEvents>) =>
      projection.messages
        .flatMap((message) => message.toolCalls)
        .find((item) => item.id === 'task-1')?.subagent?.runs?.[0]?.projection;

    expect(findRun(first)).toBe(findRun(second));
  });

  it('renders subagent approvals inside the nested timeline', () => {
    const projection = projectEvents([
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '修改文件' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 2,
        type: 'tool.requested',
        parentToolCallId: 'task-1',
        payload: {
          toolCallId: 'child-tool-1',
          name: 'write_file',
          input: { path: 'src/a.ts' }
        }
      }),
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 3,
        type: 'approval.requested',
        parentToolCallId: 'task-1',
        payload: {
          approvalId: 'approval-child-1',
          toolCallId: 'child-tool-1',
          scope: 'write_file src/a.ts'
        }
      })
    ]);

    const tool = projection.messages
      .flatMap((message) => message.toolCalls)
      .find((item) => item.id === 'task-1');
    const run = tool?.subagent?.runs?.[0];

    expect(tool?.subagent?.pendingApprovals).toBe(1);
    expect(run?.projection.approvals).toMatchObject([
      { id: 'approval-child-1', toolCallId: 'child-tool-1', status: 'pending' }
    ]);
    expect(projection.approvals.some((approval) => approval.id === 'approval-child-1')).toBe(true);
  });

  it('keeps incremental subagent delta projection identical to a full recompute', () => {
    const base = [
      event({
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 1,
        type: 'tool.requested',
        payload: { toolCallId: 'task-1', name: 'task', input: { prompt: '总结' } }
      }),
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 2,
        type: 'message.delta',
        parentToolCallId: 'task-1',
        payload: { messageId: 'child-msg-1', text: 'Hel' }
      })
    ];
    projectEvents(base);
    const fullEvents = [
      ...base,
      event({
        sessionId: 'session-1',
        runId: 'child-1',
        seq: 3,
        type: 'message.delta',
        parentToolCallId: 'task-1',
        payload: { messageId: 'child-msg-1', text: 'lo' }
      })
    ];

    const incremental = projectEvents(fullEvents);
    clearSubagentProjectionCache();
    const full = projectEvents(fullEvents);

    const findMessages = (projection: ReturnType<typeof projectEvents>) =>
      projection.messages
        .flatMap((message) => message.toolCalls)
        .find((tool) => tool.id === 'task-1')?.subagent?.runs?.[0]?.projection.messages;

    expect(findMessages(incremental)).toEqual(findMessages(full));
    expect(findMessages(incremental)?.[0]?.content).toBe('Hello');
  });
});
