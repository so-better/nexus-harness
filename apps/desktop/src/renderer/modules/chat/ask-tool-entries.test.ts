/**
 * 消息时间线配对测试：ask_user 与工具调用保持原始顺序。
 */

import { describe, expect, it } from 'vitest';
import type { ChatAskUser, ChatToolCall } from './types';
import { buildToolEntries, unmatchedAskUsers } from './ask-tool-entries';

const tool = (id: string, name: string): ChatToolCall => ({
  id,
  name,
  input: {},
  status: 'succeeded'
});

const ask = (requestId: string, toolCallId?: string): ChatAskUser => ({
  requestId,
  questions: [{ id: 'q', question: '?' }],
  status: 'resolved',
  ...(toolCallId ? { toolCallId } : {})
});

describe('buildToolEntries', () => {
  it('按显式 toolCallId 把提问插到对应工具位置', () => {
    const entries = buildToolEntries(
      [tool('a', 'list_dir'), tool('t1', 'ask_user'), tool('b', 'grep'), tool('t2', 'ask_user')],
      [ask('ask-1', 't1'), ask('ask-2', 't2')]
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['tool', 'ask', 'tool', 'ask']);
    expect(entries[1]).toMatchObject({ kind: 'ask', ask: { requestId: 'ask-1' } });
    expect(entries[3]).toMatchObject({ kind: 'ask', ask: { requestId: 'ask-2' } });
  });

  it('旧事件没有 toolCallId 时按顺序配对', () => {
    const entries = buildToolEntries(
      [tool('t1', 'ask_user'), tool('t2', 'ask_user')],
      [ask('ask-1'), ask('ask-2')]
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['ask', 'ask']);
    expect(entries[0]).toMatchObject({ ask: { requestId: 'ask-1' } });
    expect(entries[1]).toMatchObject({ ask: { requestId: 'ask-2' } });
  });

  it('忽略 save_file', () => {
    const entries = buildToolEntries([tool('s', 'save_file'), tool('a', 'list_dir')], []);
    expect(entries.map((entry) => entry.tool.name)).toEqual(['list_dir']);
  });

  it('没有对应提问的 ask_user 仍保留为工具条目', () => {
    const entries = buildToolEntries([tool('t1', 'ask_user')], []);
    expect(entries).toEqual([{ kind: 'tool', tool: tool('t1', 'ask_user') }]);
    expect(unmatchedAskUsers(entries, [])).toEqual([]);
  });

  it('返回未配对的提问供兜底展示', () => {
    const entries = buildToolEntries([tool('t1', 'ask_user')], [ask('ask-1', 't1'), ask('ask-2')]);
    expect(unmatchedAskUsers(entries, [ask('ask-1', 't1'), ask('ask-2')])).toEqual([ask('ask-2')]);
  });
  it('缺少 toolCallId 时按问题指纹配对', () => {
    const first = tool('t1', 'ask_user');
    first.input = { questions: [{ id: 'q2', question: '第二问？' }] };
    const second = tool('t2', 'ask_user');
    second.input = { questions: [{ id: 'q1', question: '第一问？' }] };
    const q1 = ask('ask-1');
    q1.questions = [{ id: 'q1', question: '第一问？' }];
    const q2 = ask('ask-2');
    q2.questions = [{ id: 'q2', question: '第二问？' }];

    const entries = buildToolEntries([first, second], [q1, q2]);
    expect(entries[0]).toMatchObject({ kind: 'ask', ask: { requestId: 'ask-2' } });
    expect(entries[1]).toMatchObject({ kind: 'ask', ask: { requestId: 'ask-1' } });
  });
});
