/**
 * Agent 服务测试：用 MockProvider 和真实文件工具跑通闭环。
 */

import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockProvider, type ChatProvider, type ProviderRequest } from '@nexus/providers';
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

  it('prepends session history and persists the current user message', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '完成' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      model: 'mock-model',
      apiKey: 'secret',
      enabled: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096
    };
    const events: NexusEvent[] = [];

    await service.run(
      {
        sessionId: 'session-1',
        prompt: '继续',
        rootPaths: [root],
        providerId: providerConfig.id
      },
      providerConfig,
      {
        history: [
          { role: 'user', content: '之前的问题' },
          { role: 'assistant', content: '之前的回答' }
        ],
        onEvent: (event) => events.push(event)
      }
    );

    expect(requests[0]?.messages.map((message) => message.content)).toEqual([
      '之前的问题',
      '之前的回答',
      '继续'
    ]);
    expect(events[0]).toMatchObject({
      type: 'message.completed',
      payload: { role: 'user', content: '继续' }
    });
  });

  it('compacts oversized tool output into artifacts before the next model call', async () => {
    await writeFile(join(root, 'large.txt'), 'x'.repeat(20_000), 'utf8');
    const provider = new MockProvider([
      {
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'large.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: '读取完成', finishReason: 'stop' }
    ]);
    const service = new AgentService({
      createProvider: () => provider,
      artifactBaseDir: join(root, 'artifacts')
    });
    const providerConfig = {
      id: 'provider-1',
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      model: 'mock-model',
      apiKey: 'secret',
      enabled: true,
      contextWindow: 4_096,
      maxOutputTokens: 1_024
    };
    const events: NexusEvent[] = [];
    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '读取大文件',
        rootPaths: [root],
        providerId: providerConfig.id
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    const completed = events.find((event) => event.type === 'tool.completed');
    expect(completed?.payload).toMatchObject({ artifactId: expect.any(String) });
    expect(result.messages.some((message) => message.content.includes('"truncated":true'))).toBe(
      true
    );
    expect(await readdir(join(root, 'artifacts', 'session-1'))).toHaveLength(1);
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
    const service = new AgentService({ createProvider });

    const providerConfig = {
      id: 'provider-1',
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      model: 'mock-model',
      apiKey: 'secret',
      enabled: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096
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
      'message.completed',
      'run.started',
      'message.completed',
      'tool.requested',
      'tool.completed',
      'message.completed',
      'run.completed'
    ]);
  });
});
