/**
 * 子代理过程投影测试：消息、推理与工具结果。
 */

import { describe, expect, it } from 'vitest';
import { projectSubagentTranscript, readSubagentTranscript } from './subagent-transcript';

describe('projectSubagentTranscript', () => {
  it('projects subagent messages and tool output into a renderable projection', () => {
    const content = JSON.stringify([
      { role: 'system', content: '子代理系统提示' },
      { role: 'user', content: '找到 a.txt 的内容' },
      {
        role: 'assistant',
        content: '',
        reasoning: '先读文件',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
      },
      { role: 'tool', toolCallId: 'call-1', content: 'hello' },
      { role: 'assistant', content: 'a.txt 的内容是 hello' }
    ]);

    const projection = projectSubagentTranscript('session-1', content);
    const tool = projection.messages
      .flatMap((message) => message.toolCalls)
      .find((item) => item.id === 'call-1');

    // 同一 Run 的助手消息会合并为一个气泡：user + assistant
    expect(projection.messages).toHaveLength(2);
    expect(tool).toMatchObject({ name: 'read_file', status: 'succeeded', output: 'hello' });
    expect(projection.messages.some((message) => message.reasoning === '先读文件')).toBe(true);
  });

  it('rejects invalid transcript JSON', () => {
    expect(() => projectSubagentTranscript('session-1', '{}')).toThrow(
      'INVALID_SUBAGENT_TRANSCRIPT'
    );
  });

  it('reads approvals from the object transcript format', () => {
    const content = JSON.stringify({
      messages: [
        { role: 'user', content: '修改文件' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'write_file', arguments: { path: 'a.txt' } }]
        },
        { role: 'tool', toolCallId: 'call-1', content: 'ok' }
      ],
      approvals: [
        {
          runId: 'child-1',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          scope: 'write_file',
          decision: 'approved'
        }
      ]
    });

    const view = readSubagentTranscript('session-1', content);
    expect(view.projection.messages).toHaveLength(2);
    expect(view.approvals).toEqual([
      {
        runId: 'child-1',
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        scope: 'write_file',
        decision: 'approved'
      }
    ]);
  });
});
