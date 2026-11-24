/**
 * 历史工具恢复测试：只统计最近若干用户轮内的工具调用。
 */

import type { ChatMessage } from '@nexus/providers';
import { describe, expect, it } from 'vitest';
import { collectRecentUsedToolNames } from './tool-history';

const assistantTool = (id: string, name: string): ChatMessage => ({
  role: 'assistant',
  content: '',
  toolCalls: [{ id, name, arguments: {} }]
});

const history: ChatMessage[] = [
  { role: 'user', content: 'u1' },
  assistantTool('t1', 'save_ppt'),
  { role: 'user', content: 'u2' },
  assistantTool('t2', 'terminal_write'),
  { role: 'user', content: 'u3' },
  assistantTool('t3', 'web_search'),
  { role: 'user', content: 'u4' },
  assistantTool('t4', 'plugin_list')
];

describe('collectRecentUsedToolNames', () => {
  it('keeps only tools from the most recent turns', () => {
    expect([...collectRecentUsedToolNames(history, 2)].sort()).toEqual([
      'plugin_list',
      'web_search'
    ]);
    expect([...collectRecentUsedToolNames(history, 1)]).toEqual(['plugin_list']);
    expect(collectRecentUsedToolNames(history, 0).size).toBe(0);
  });

  it('keeps all tools when the history has fewer turns than the window', () => {
    expect([...collectRecentUsedToolNames(history, 10)].sort()).toEqual([
      'plugin_list',
      'save_ppt',
      'terminal_write',
      'web_search'
    ]);
  });
});
