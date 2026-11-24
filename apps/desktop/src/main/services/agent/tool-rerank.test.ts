/**
 * 工具重排测试：模型挑选最终 K 个，失败或非法输出回退到 BM25 前 K 个。
 */

import type { ChatProvider } from '@nexus/providers';
import { describe, expect, it } from 'vitest';
import { rerankTools } from './tool-rerank';
import type { SelectableTool } from './tool-selector';

const make = (name: string, description: string): SelectableTool => ({
  name,
  description,
  group: 'office',
  source: 'builtin',
  permission: 'write',
  requiresApproval: false,
  inputSchema: { type: 'object', properties: {} }
});

const candidates = Array.from({ length: 12 }, (_value, index) =>
  make(`tool_${index}`, `description ${index}`)
);

const providerReturning = (text: string): ChatProvider => ({
  capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
  async *stream() {
    yield { type: 'text-delta', text };
    yield { type: 'finish', reason: 'stop' };
  }
});

describe('tool-rerank', () => {
  it('keeps only the tools picked by the model', async () => {
    const result = await rerankTools({
      provider: providerReturning('["tool_3", "tool_7", "unknown"]'),
      model: 'mock',
      query: '需要 tool_3 和 tool_7',
      candidates,
      maxTools: 4
    });
    expect(result.selected.map((tool) => tool.name)).toEqual(['tool_3', 'tool_7']);
  });

  it('falls back to the BM25 top-K on invalid output', async () => {
    const result = await rerankTools({
      provider: providerReturning('not json'),
      model: 'mock',
      query: 'x',
      candidates,
      maxTools: 4
    });
    expect(result.selected.map((tool) => tool.name)).toEqual([
      'tool_0',
      'tool_1',
      'tool_2',
      'tool_3'
    ]);
  });

  it('honors an explicit empty selection from the model', async () => {
    const result = await rerankTools({
      provider: providerReturning('[]'),
      model: 'mock',
      query: 'x',
      candidates,
      maxTools: 4
    });
    expect(result.selected).toEqual([]);
  });

  it('falls back when the model returns only unknown names', async () => {
    const result = await rerankTools({
      provider: providerReturning('["unknown_tool"]'),
      model: 'mock',
      query: 'x',
      candidates,
      maxTools: 3
    });
    expect(result.selected.map((tool) => tool.name)).toEqual(['tool_0', 'tool_1', 'tool_2']);
  });

  it('falls back when the provider emits an error', async () => {
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream() {
        yield { type: 'error', code: 'MOCK', message: 'boom' };
      }
    };
    const result = await rerankTools({
      provider,
      model: 'mock',
      query: 'x',
      candidates,
      maxTools: 3
    });
    expect(result.selected.map((tool) => tool.name)).toEqual(['tool_0', 'tool_1', 'tool_2']);
  });

  it('skips the model call when candidates fit within K', async () => {
    let called = false;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream() {
        called = true;
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const result = await rerankTools({
      provider,
      model: 'mock',
      query: 'x',
      candidates: candidates.slice(0, 2),
      maxTools: 4
    });
    expect(called).toBe(false);
    expect(result.selected).toHaveLength(2);
  });
});
