/* Agent 服务测试：用 MockProvider 和真实文件工具跑通闭环。 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockProvider } from '@nexus/providers';
import type { NexusEvent } from '@shared/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentService } from './agent-service';

describe('AgentService', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-agent-'));
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs a tool call and returns the final messages', async () => {
    const provider = new MockProvider([
      {
        text: '读取文件',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: '读取完成', finishReason: 'stop' }
    ]);
    const createProvider = vi.fn(() => provider);
    const service = new AgentService(createProvider);

    const providerConfig = {
      id: 'provider-1',
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      model: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];
    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '读取 a.txt',
        rootPaths: [root],
        providerId: providerConfig.id
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://example.com/v1' })
    );
    expect(result.steps).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(result.finishReason).toBe('stop');
    expect(result.messages.some((message) => message.content === 'hello')).toBe(true);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: '读取完成' });
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'message.completed',
      'tool.requested',
      'tool.completed',
      'message.completed',
      'run.completed'
    ]);
  });
});
