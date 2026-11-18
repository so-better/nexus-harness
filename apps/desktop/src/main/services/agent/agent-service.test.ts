/**
 * Agent 服务测试：用 MockProvider 和真实文件工具跑通闭环。
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockProvider, type ChatProvider, type ProviderRequest } from '@nexus/providers';
import type { NexusEvent } from '@shared/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../storage/database';
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
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];

    await service.run(
      {
        sessionId: 'session-1',
        prompt: '继续',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
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

    expect(requests[0]?.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Build')
    });
    expect(requests[0]?.messages.slice(1).map((message) => message.content)).toEqual([
      '之前的问题',
      '之前的回答',
      '继续'
    ]);
    expect(events[0]).toMatchObject({
      type: 'message.completed',
      payload: { role: 'user', content: '继续' }
    });
  });

  it('runs without a workspace and does not expose local tools', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '无需工作区' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };

    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '你好',
        rootPaths: [],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig
    );

    expect(result.finishReason).toBe('stop');
    expect(requests[0]?.tools?.map((tool) => tool.name)).toEqual(['ask_user', 'save_file']);
  });

  it('makes Plan mode read-only and blocks write tools', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          const toolCall = {
            id: 'call-1',
            name: 'write_file',
            arguments: { path: 'b.txt', content: 'x' }
          };
          yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool-call-delta',
            id: toolCall.id,
            argumentsDelta: JSON.stringify(toolCall.arguments)
          };
          yield { type: 'tool-call-end', toolCall };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text-delta', text: '规划完成' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];

    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '规划修改',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model',
        mode: 'plan'
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    expect(result.finishReason).toBe('stop');
    expect(requests[0]?.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Plan')
    });
    expect(requests[0]?.tools?.map((tool) => tool.name)).not.toContain('write_file');
    expect(requests[0]?.tools?.map((tool) => tool.name)).not.toContain('save_file');
    const failed = events.find(
      (event): event is NexusEvent<'tool.failed'> => event.type === 'tool.failed'
    );
    expect(failed?.payload.error.code).toBe('TOOL_MODE_DENIED');
  });

  it('pauses for ask_user and feeds answers back to the model', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          const toolCall = {
            id: 'ask-1',
            name: 'ask_user',
            arguments: {
              questions: [
                {
                  id: 'scope',
                  question: '要处理哪个范围？',
                  options: [
                    { id: 'core', label: 'Core' },
                    { id: 'desktop', label: 'Desktop' }
                  ],
                  required: true
                }
              ]
            }
          };
          yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool-call-delta',
            id: toolCall.id,
            argumentsDelta: JSON.stringify(toolCall.arguments)
          };
          yield { type: 'tool-call-end', toolCall };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text-delta', text: '收到范围' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];
    const askUser = vi
      .fn()
      .mockResolvedValue([{ questionId: 'scope', selectedOptionIds: ['core'] }]);

    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '开始',
        rootPaths: [],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { askUser, onEvent: (event) => events.push(event) }
    );

    expect(result.finishReason).toBe('stop');
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'ask_user.requested')).toBe(true);
    expect(events.some((event) => event.type === 'ask_user.resolved')).toBe(true);
    expect(requests[1]?.messages.some((message) => message.content.includes('"core"'))).toBe(true);
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
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 4_096, maxOutputTokens: 1_024 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];
    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '读取大文件',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
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
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];
    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '读取 a.txt',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
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
      'message.delta',
      'message.completed',
      'tool.requested',
      'tool.completed',
      'message.delta',
      'message.completed',
      'run.completed'
    ]);
  });

  it('writes a file, runs it, and returns the final response after approvals', async () => {
    let step = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream() {
        step += 1;
        if (step === 1) {
          const toolCall = {
            id: 'write-1',
            name: 'write_file',
            arguments: { path: 'b.txt', content: 'hello' }
          };
          yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool-call-delta',
            id: toolCall.id,
            argumentsDelta: JSON.stringify(toolCall.arguments)
          };
          yield { type: 'tool-call-end', toolCall };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        if (step === 2) {
          const toolCall = {
            id: 'run-1',
            name: 'run_command',
            arguments: {
              command:
                "node -e \"process.stdout.write(require('fs').readFileSync('b.txt','utf8'))\""
            }
          };
          yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool-call-delta',
            id: toolCall.id,
            argumentsDelta: JSON.stringify(toolCall.arguments)
          };
          yield { type: 'tool-call-end', toolCall };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text-delta', text: '写入并运行完成' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };

    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '写入并运行',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { approveTool: async () => true }
    );

    expect(await readFile(join(root, 'b.txt'), 'utf8')).toBe('hello');
    expect(result.toolCalls).toBe(2);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: '写入并运行完成' });
  });

  it('saves generated files without a workspace and emits file.created', async () => {
    const db = createDatabase(join(root, 'nexus.db'));
    const fileBaseDir = join(root, 'files');
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        if (request.messages.length === 2) {
          const toolCall = {
            id: 'save-1',
            name: 'save_file',
            arguments: { name: 'report.md', content: '# 报告' }
          };
          yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool-call-delta',
            id: toolCall.id,
            argumentsDelta: JSON.stringify(toolCall.arguments)
          };
          yield { type: 'tool-call-end', toolCall };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        yield { type: 'text-delta', text: '文件已保存' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = new AgentService({
      createProvider: () => provider,
      database: db,
      fileBaseDir
    });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 128_000, maxOutputTokens: 4_096 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const events: NexusEvent[] = [];

    try {
      await service.run(
        {
          sessionId: 'session-1',
          prompt: '生成报告',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig,
        { onEvent: (event) => events.push(event) }
      );

      const files = db
        .prepare('SELECT name, mime FROM files WHERE session_id = ?')
        .all('session-1') as Array<{ name: string; mime: string }>;
      expect(files).toEqual([{ name: 'report.md', mime: 'text/markdown' }]);
      expect(events.some((event) => event.type === 'file.created')).toBe(true);
    } finally {
      db.close();
    }
  });
});
