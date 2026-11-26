/**
 * Agent 服务测试：用 MockProvider 和真实文件工具跑通闭环。
 */

import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MockProvider,
  type ChatMessage,
  type ChatProvider,
  type ProviderRequest
} from '@nexus/providers';
import type { NexusEvent } from '@shared/events';
import type { AskQuestion } from '@shared/ask-user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../storage/database';
import { AgentService, buildModelExtraParams, createAgentProvider } from './agent-service';
import { AttachmentService } from '../attachments/attachment-service';
import { MemoryService } from '../memory/memory-service';
import type { SkillService } from '../skills/skill-service';

describe('AgentService', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-agent-'));
    await writeFile(join(root, 'a.txt'), 'hello', 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('passes assistant reasoning back for DeepSeek', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    try {
      const provider = createAgentProvider({
        id: 'deepseek',
        protocol: 'openai',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'secret',
        enabled: true,
        models: [{ id: 'deepseek-flash', contextWindow: 1_000_000, maxOutputTokens: 32_768 }],
        defaultModelId: 'deepseek-flash'
      });
      for await (const _event of provider.stream({
        model: 'deepseek-flash',
        messages: [{ role: 'assistant', content: '', reasoning: '先检查工具结果' }],
        tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
      })) {
        // 消费流以触发请求
      }
      const init = fetchMock.mock.calls[0]?.[1];
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ reasoning_content?: string }>;
      };
      expect(body.messages[0]?.reasoning_content).toBe('先检查工具结果');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not pass assistant reasoning back for non-DeepSeek providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    );
    try {
      const provider = createAgentProvider({
        id: 'ollama',
        protocol: 'ollama',
        name: 'Ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        enabled: true,
        models: [{ id: 'llama', contextWindow: 8192, maxOutputTokens: 2048 }],
        defaultModelId: 'llama'
      });
      for await (const _event of provider.stream({
        model: 'llama',
        messages: [{ role: 'assistant', content: '', reasoning: '不应回传' }],
        tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
      })) {
        // 消费流以触发请求
      }
      const init = fetchMock.mock.calls[0]?.[1];
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ reasoning_content?: string }>;
      };
      expect(body.messages[0]).not.toHaveProperty('reasoning_content');
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('passes model JSON params through without interpreting thinking', () => {
    const params = {
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      custom: true
    };
    expect(buildModelExtraParams({ extraParams: params })).toEqual(params);
    expect(buildModelExtraParams({})).toBeUndefined();
    expect(buildModelExtraParams({ extraParams: {} })).toBeUndefined();
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
        modelId: 'mock-model',
        references: [{ path: join(root, 'a.txt'), name: 'a.txt' }]
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
    expect(requests[0]?.messages[0]?.content).toContain('事实/工具');
    expect(requests[0]?.messages.slice(1, 3).map((message) => message.content)).toEqual([
      '之前的问题',
      '之前的回答'
    ]);
    const currentPrompt = requests[0]?.messages[3]?.content ?? '';
    expect(currentPrompt).toContain(`继续\n\n@${join(root, 'a.txt')}`);
    expect(currentPrompt).toContain('<environment>');
    expect(currentPrompt).toContain('平台：');
    expect(currentPrompt).toContain(`授权目录：\n- ${root}`);
    expect(events[0]).toMatchObject({
      type: 'message.completed',
      payload: {
        role: 'user',
        content: '继续',
        references: [{ path: join(root, 'a.txt'), name: 'a.txt' }]
      }
    });
  });

  it('exposes local tools without a workspace for on-demand authorization', async () => {
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
    expect(requests[0]?.messages[0]?.content).toContain('无工作区');
    expect(requests[0]?.tools?.map((tool) => tool.name)).toEqual([
      'read_file',
      'list_dir',
      'write_file',
      'apply_patch',
      'run_command',
      'glob',
      'grep',
      'ask_user',
      'read_artifact',
      'task',
      'open_url',
      'save_file',
      'save_word',
      'save_excel',
      'save_ppt',
      'save_pdf',
      'web_search',
      'web_fetch',
      'theme_get',
      'theme_update',
      'skin_list',
      'skin_apply',
      'terminal_get_settings',
      'terminal_update_settings',
      'terminal_list',
      'terminal_create',
      'terminal_request_access',
      'terminal_read',
      'terminal_wait',
      'terminal_write',
      'terminal_close',
      'open_system_terminal',
      'cache_get_info',
      'cache_clear',
      'backup_status',
      'backup_export',
      'backup_import',
      'plugin_list',
      'plugin_read',
      'plugin_reload',
      'plugin_set_enabled',
      'plugin_delete',
      'plugin_import',
      'plugin_write',
      'skill_list',
      'skill_refresh',
      'skill_import',
      'skill_create',
      'skill_update',
      'skill_delete',
      'mcp_update',
      'mcp_list',
      'mcp_read',
      'mcp_save',
      'mcp_refresh',
      'mcp_test'
    ]);
  });

  it('requires plugin-development before creating a plugin', async () => {
    let step = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream() {
        step += 1;
        const call =
          step === 1
            ? {
                id: 'plugin-create-1',
                name: 'plugin_write',
                arguments: { id: 'test.plugin', files: { 'plugin.json': '{}' } }
              }
            : step === 2
              ? {
                  id: 'skill-read-1',
                  name: 'read_skill',
                  arguments: { name: 'plugin-development' }
                }
              : step === 3
                ? {
                    id: 'plugin-create-2',
                    name: 'plugin_write',
                    arguments: { id: 'test.plugin', files: { 'plugin.json': '{}' } }
                  }
                : undefined;
        if (!call) {
          yield { type: 'text-delta', text: '完成' };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        yield { type: 'tool-call-start', id: call.id, name: call.name };
        yield {
          type: 'tool-call-delta',
          id: call.id,
          argumentsDelta: JSON.stringify(call.arguments)
        };
        yield { type: 'tool-call-end', toolCall: call };
        yield { type: 'finish', reason: 'tool_calls' };
      }
    };
    const skills = {
      read: async (name: string) => ({ id: name, content: '插件开发说明' })
    } as unknown as SkillService;
    const service = new AgentService({ createProvider: () => provider, skills });
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
        sessionId: 'plugin-skill-test',
        prompt: '写一个插件',
        rootPaths: [],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { onEvent: (event) => events.push(event), autoApprove: () => true }
    );

    const failures = events
      .filter((event) => event.type === 'tool.failed')
      .map((event) => (event.payload as { error?: { code?: string } }).error?.code);
    expect(failures[0]).toBe('PLUGIN_DEVELOPMENT_SKILL_REQUIRED');
    expect(events.some((event) => event.type === 'skill.activated')).toBe(true);
    expect(failures[1]).toBe('PLUGIN_HOST_UNAVAILABLE');
  });

  it('injects active global memory into the dynamic environment context', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '收到' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const db = createDatabase(join(root, 'memory.db'));
    new MemoryService(db).create({
      title: '回答风格',
      content: '偏好简洁中文回答。',
      kind: 'preference'
    });
    const service = new AgentService({ createProvider: () => provider, database: db });
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

    try {
      await service.run(
        {
          sessionId: 'session-memory',
          prompt: '帮我回答',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig
      );
    } finally {
      db.close();
    }

    // 记忆放在动态环境块中，追加到最后一条用户消息，避免破坏系统提示缓存
    const lastUser = [...(requests[0]?.messages ?? [])].reverse().find((m) => m.role === 'user');
    expect(lastUser?.content).toContain('长期记忆');
    expect(lastUser?.content).toContain('偏好简洁中文回答');
    expect(requests[0]?.messages[0]?.content).not.toContain('偏好简洁中文回答');
  });

  it('skips memory injection when retrieval is disabled', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '收到' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const db = createDatabase(join(root, 'memory-retrieval.db'));
    const memory = new MemoryService(db);
    memory.create({ title: '回答风格', content: '偏好简洁中文回答。', kind: 'preference' });
    memory.updateSettings({ autoCapture: true, retrieval: false });
    const service = new AgentService({ createProvider: () => provider, database: db });
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

    try {
      await service.run(
        {
          sessionId: 'session-memory-retrieval',
          prompt: '帮我回答',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig
      );
    } finally {
      db.close();
    }

    expect(requests[0]?.messages[0]?.content).not.toContain('<memory>');
  });

  it('extracts proposed memories with the current model', async () => {
    const db = createDatabase(join(root, 'memory-extract.db'));
    const provider = new MockProvider([
      { text: '好的，我会保持简洁。', finishReason: 'stop' },
      {
        text: '[{"title":"回答风格","content":"偏好简洁中文回答","kind":"preference"}]',
        finishReason: 'stop'
      }
    ]);
    const service = new AgentService({
      createProvider: () => provider,
      database: db,
      memoryExtraction: true
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

    try {
      await service.run(
        {
          sessionId: 'session-memory-extract',
          prompt: '以后请始终保持简洁中文回答。',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig
      );
      expect(new MemoryService(db).list()[0]).toMatchObject({
        status: 'proposed',
        content: '偏好简洁中文回答'
      });
    } finally {
      db.close();
    }
  });

  it('does not request directory authorization in Plan mode', async () => {
    const service = new AgentService({
      createProvider: () =>
        new MockProvider([
          {
            toolCalls: [{ id: 'read-1', name: 'read_file', arguments: { path: '/tmp/plan.txt' } }],
            finishReason: 'tool_calls'
          },
          { text: '需要先选择工作区', finishReason: 'stop' }
        ])
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
    const requestWorkspace = vi.fn();

    await service.run(
      {
        sessionId: 'session-1',
        prompt: '只做规划',
        rootPaths: [],
        providerId: providerConfig.id,
        modelId: 'mock-model',
        mode: 'plan'
      },
      providerConfig,
      { requestWorkspace, onEvent: (event) => events.push(event) }
    );

    expect(requestWorkspace).not.toHaveBeenCalled();
    const failed = events.find(
      (event): event is NexusEvent<'tool.failed'> => event.type === 'tool.failed'
    );
    expect(failed?.payload.error.code).toBe('TOOL_WORKSPACE_REQUIRED');
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
    expect(requests[0]?.tools?.map((tool) => tool.name)).not.toContain('open_url');
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

  it('compacts long history before the first model call on a small window', async () => {
    const provider = new MockProvider([
      { text: '摘要：用户要求处理长任务。', finishReason: 'stop' },
      { text: '完成', finishReason: 'stop' }
    ]);
    const service = new AgentService({ createProvider: () => provider });
    const providerConfig = {
      id: 'provider-1',
      protocol: 'openai' as const,
      name: 'Mock Provider',
      baseUrl: 'https://example.com/v1',
      models: [{ id: 'mock-model', contextWindow: 5_120, maxOutputTokens: 1_024 }],
      defaultModelId: 'mock-model',
      apiKey: 'secret',
      enabled: true
    };
    const history: ChatMessage[] = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `历史消息 ${index}: ${'x'.repeat(800)}`
    }));
    const events: NexusEvent[] = [];

    const result = await service.run(
      {
        sessionId: 'session-1',
        prompt: '继续处理',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model',
        mode: 'plan'
      },
      providerConfig,
      { history, onEvent: (event) => events.push(event) }
    );

    expect(result.finishReason).toBe('stop');
    const compacted = events.find(
      (event): event is NexusEvent<'context.compacted'> => event.type === 'context.compacted'
    );
    expect(compacted).toBeDefined();
    expect(compacted?.payload.strategy).toContain('summarized');
  });

  it('keeps full tool output for UI but compacts it before the next model call', async () => {
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
      models: [{ id: 'mock-model', contextWindow: 6_144, maxOutputTokens: 1_024 }],
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
    // 事件里保留完整输出，供 UI 与审计使用
    expect((completed?.payload as { output?: string }).output).toHaveLength(20_000);
    // 下一次模型调用前由上下文压缩落 Artifact，模型只看预览并可用 read_artifact 回读
    const compacted = events.find((event) => event.type === 'context.compacted');
    expect((compacted?.payload as { artifactIds?: string[] }).artifactIds?.length).toBeGreaterThan(
      0
    );
    expect(result.messages.some((message) => message.content.includes('"truncated":true'))).toBe(
      true
    );
    expect((await readdir(join(root, 'artifacts', 'session-1'))).length).toBeGreaterThan(0);
  });

  it('runs an explore subagent and returns only its summary', async () => {
    const provider = new MockProvider([
      {
        toolCalls: [
          {
            id: 'task-1',
            name: 'task',
            arguments: { prompt: '读取 a.txt 并总结', agent: 'explore' }
          }
        ],
        finishReason: 'tool_calls'
      },
      {
        toolCalls: [{ id: 'child-1', name: 'read_file', arguments: { path: 'a.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: 'a.txt 的内容是 hello', finishReason: 'stop' },
      { text: '完成', finishReason: 'stop' }
    ]);
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
        sessionId: 'session-subagent',
        prompt: '探索 a.txt',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    const taskCompleted = events.find(
      (event) =>
        event.type === 'tool.completed' &&
        (event.payload as { toolCallId?: string }).toolCallId === 'task-1'
    );
    expect((taskCompleted?.payload as { output?: string } | undefined)?.output).toContain('hello');
    expect(events.some((event) => event.type === 'subagent.started')).toBe(true);
    expect(events.some((event) => event.type === 'subagent.progress')).toBe(true);
    expect(events.some((event) => event.type === 'subagent.completed')).toBe(true);
  });

  it('forwards child approvals with parentToolCallId and resumes after approval', async () => {
    const provider = new MockProvider([
      {
        toolCalls: [
          {
            id: 'task-approve',
            name: 'task',
            arguments: { prompt: '写 b.txt', agent: 'general' }
          }
        ],
        finishReason: 'tool_calls'
      },
      {
        toolCalls: [
          {
            id: 'child-write',
            name: 'write_file',
            arguments: { path: 'b.txt', content: 'approved' }
          }
        ],
        finishReason: 'tool_calls'
      },
      { text: '子代理完成', finishReason: 'stop' },
      { text: '父完成', finishReason: 'stop' }
    ]);
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
    let releaseApproval: ((approved: boolean) => void) | undefined;
    const approvalGate = new Promise<boolean>((resolve) => {
      releaseApproval = resolve;
    });
    const events: NexusEvent[] = [];
    await service.run(
      {
        sessionId: 'session-subagent-approval',
        prompt: '写文件',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      {
        onEvent: (event) => {
          events.push(event);
          if (event.type === 'approval.requested') releaseApproval?.(true);
        },
        approveTool: async () => approvalGate,
        autoApprove: async () => false
      }
    );

    const approval = events.find(
      (event) => event.type === 'approval.requested' && event.parentToolCallId
    );
    expect(approval?.parentToolCallId).toBe('task-approve');
    expect((approval?.payload as { toolCallId?: string } | undefined)?.toolCallId).toBe(
      'child-write'
    );
    await expect(readFile(join(root, 'b.txt'), 'utf8')).resolves.toBe('approved');
  });

  it('tags child workspace authorization requests with the parent task call', async () => {
    const provider = new MockProvider([
      {
        toolCalls: [
          {
            id: 'task-ws',
            name: 'task',
            arguments: { prompt: '写 c.txt', agent: 'general' }
          }
        ],
        finishReason: 'tool_calls'
      },
      {
        toolCalls: [
          {
            id: 'child-write-c',
            name: 'write_file',
            arguments: { path: 'c.txt', content: 'x' }
          }
        ],
        finishReason: 'tool_calls'
      },
      { text: '子代理结束', finishReason: 'stop' },
      { text: '父结束', finishReason: 'stop' }
    ]);
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
    const workspaceRequests: Array<{ name: string; parentToolCallId?: string }> = [];
    await service.run(
      {
        sessionId: 'session-subagent-workspace',
        prompt: '写文件',
        rootPaths: [],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      {
        requestWorkspace: async (call) => {
          workspaceRequests.push(call);
          return undefined;
        },
        autoApprove: async () => true
      }
    );

    expect(workspaceRequests[0]).toMatchObject({
      name: 'write_file',
      parentToolCallId: 'task-ws'
    });
  });

  it('runs parallel explore subagents and merges their summaries', async () => {
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        const system = request.messages.find((message) => message.role === 'system')?.content ?? '';
        if (request.messages.some((message) => message.role === 'tool')) {
          yield { type: 'text-delta', text: '完成' };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        if (system.includes('只读探索子代理')) {
          const user =
            [...request.messages].reverse().find((message) => message.role === 'user')?.content ??
            '';
          yield { type: 'text-delta', text: `结论:${user}` };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        yield {
          type: 'tool-call-end',
          toolCall: { id: 'tasks-1', name: 'task', arguments: { prompts: ['方向A', '方向B'] } }
        };
        yield { type: 'finish', reason: 'tool_calls' };
      }
    };
    const service = new AgentService({
      createProvider: () => provider,
      artifactBaseDir: join(root, 'artifacts')
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
    await service.run(
      {
        sessionId: 'session-tasks',
        prompt: '并行探索',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    const completed = events.find(
      (event) =>
        event.type === 'tool.completed' &&
        (event.payload as { toolCallId?: string }).toolCallId === 'tasks-1'
    );
    const output = (completed?.payload as { output?: string } | undefined)?.output ?? '';
    expect(output).toContain('方向A');
    expect(output).toContain('方向B');
    const subagentDone = events.find((event) => event.type === 'subagent.completed');
    const transcripts =
      (subagentDone?.payload as { transcripts?: Array<{ index: number; ref: string }> } | undefined)
        ?.transcripts ?? [];
    expect(transcripts).toHaveLength(2);
    expect(transcripts[0]).toMatchObject({ index: 0, ref: expect.any(String) });
  });

  it('runs parallel general subagents', async () => {
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        const system = request.messages.find((message) => message.role === 'system')?.content ?? '';
        if (request.messages.some((message) => message.role === 'tool')) {
          yield { type: 'text-delta', text: '完成' };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        if (system.includes('你是子代理')) {
          const user =
            [...request.messages].reverse().find((message) => message.role === 'user')?.content ??
            '';
          yield { type: 'text-delta', text: `通用:${user}` };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        yield {
          type: 'tool-call-end',
          toolCall: {
            id: 'tasks-general',
            name: 'task',
            arguments: { prompts: ['任务A', '任务B'], agent: 'general' }
          }
        };
        yield { type: 'finish', reason: 'tool_calls' };
      }
    };
    const service = new AgentService({
      createProvider: () => provider,
      artifactBaseDir: join(root, 'artifacts')
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
    await service.run(
      {
        sessionId: 'session-tasks-general',
        prompt: '并行通用任务',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    const completed = events.find(
      (event) =>
        event.type === 'tool.completed' &&
        (event.payload as { toolCallId?: string }).toolCallId === 'tasks-general'
    );
    const output = (completed?.payload as { output?: string } | undefined)?.output ?? '';
    expect(output).toContain('通用:任务A');
    expect(output).toContain('通用:任务B');
    const subagentDone = events.find((event) => event.type === 'subagent.completed');
    expect((subagentDone?.payload as { agent?: string } | undefined)?.agent).toBe('general');
  });

  it('detects parallel general subagents writing the same file', async () => {
    let callId = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        const system = request.messages.find((message) => message.role === 'system')?.content ?? '';
        const hasToolResult = request.messages.some((message) => message.role === 'tool');
        if (system.includes('你是子代理')) {
          if (hasToolResult) {
            yield { type: 'text-delta', text: '完成' };
            yield { type: 'finish', reason: 'stop' };
            return;
          }
          const user =
            [...request.messages].reverse().find((message) => message.role === 'user')?.content ??
            '';
          yield {
            type: 'tool-call-end',
            toolCall: {
              id: `write-${(callId += 1)}`,
              name: 'write_file',
              arguments: {
                path: user.includes('写A') ? './conflict.txt' : 'conflict.txt',
                content: 'x'
              }
            }
          };
          yield { type: 'finish', reason: 'tool_calls' };
          return;
        }
        if (hasToolResult) {
          yield { type: 'text-delta', text: '完成' };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        yield {
          type: 'tool-call-end',
          toolCall: {
            id: 'tasks-conflict',
            name: 'task',
            arguments: { prompts: ['写A', '写B'], agent: 'general' }
          }
        };
        yield { type: 'finish', reason: 'tool_calls' };
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
        sessionId: 'session-conflict',
        prompt: '并行写同一文件',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { onEvent: (event) => events.push(event), autoApprove: async () => true }
    );

    const conflicts = events.filter((event) => {
      if (event.type !== 'subagent.progress') return false;
      const payload = event.payload as { name?: string; ok?: boolean };
      return payload.ok === false && (payload.name ?? '').includes('write_file');
    });
    expect(conflicts.length).toBeGreaterThan(0);
    await expect(readFile(join(root, 'conflict.txt'), 'utf8')).resolves.toBe('x');
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

  it('loads image references into the user message and persists their metadata', async () => {
    const imagePath = join(root, 'photo.png');
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let userImages: unknown;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: true, reasoning: false },
      async *stream(request) {
        const user = request.messages.find((message) => message.role === 'user');
        userImages = user?.images;
        yield { type: 'text-delta', text: '看到了' };
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
        prompt: '看看 @photo.png',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model',
        imagePaths: [imagePath]
      },
      providerConfig,
      { onEvent: (event) => events.push(event) }
    );

    expect(userImages).toMatchObject([{ mimeType: 'image/png', data: 'iVBORw==' }]);
    const userEvent = events.find(
      (event): event is NexusEvent<'message.completed'> =>
        event.type === 'message.completed' && (event.payload as { role?: string }).role === 'user'
    );
    expect(userEvent?.payload.images).toEqual([
      { path: await realpath(imagePath), mime: 'image/png' }
    ]);
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

  it('asks the user to choose an image model when multiple are enabled', async () => {
    const db = createDatabase(join(root, 'image-selection.db'));
    let step = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream() {
        if (step++ > 0) {
          yield { type: 'text-delta', text: '已取消生图' };
          yield { type: 'finish', reason: 'stop' };
          return;
        }
        const toolCall = {
          id: 'image-1',
          name: 'generate_image',
          arguments: { prompt: '一只猫' }
        };
        yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
        yield {
          type: 'tool-call-delta',
          id: toolCall.id,
          argumentsDelta: JSON.stringify(toolCall.arguments)
        };
        yield { type: 'tool-call-end', toolCall };
        yield { type: 'finish', reason: 'tool_calls' };
      }
    };
    const service = new AgentService({
      createProvider: () => provider,
      database: db,
      fileBaseDir: join(root, 'files'),
      imageSettings: async () => ({
        configs: [
          {
            id: 'image-a',
            name: 'Image A',
            model: 'model-a',
            enabled: true,
            template: { url: 'https://example.com/a', body: {} }
          },
          {
            id: 'image-b',
            name: 'Image B',
            model: 'model-b',
            enabled: true,
            template: { url: 'https://example.com/b', body: {} }
          }
        ]
      })
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
    const asked: AskQuestion[] = [];
    const events: NexusEvent[] = [];

    try {
      await service.run(
        {
          sessionId: 'image-selection',
          prompt: '生成一只猫',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig,
        {
          onEvent: (event) => events.push(event),
          autoApprove: () => true,
          askUser: async (_requestId, questions) => {
            asked.push(...questions);
            return undefined;
          }
        }
      );

      expect(asked).toHaveLength(1);
      expect(asked[0]?.options?.map((option) => option.id)).toEqual(['image-a', 'image-b']);
      expect(events.some((event) => event.type === 'ask_user.requested')).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === 'tool.failed' &&
            (event.payload as { error?: { code?: string } }).error?.code ===
              'IMAGE_MODEL_SELECTION_CANCELLED'
        )
      ).toBe(true);
    } finally {
      db.close();
    }
  });

  it('loads text attachments into the current user message and records metadata', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '收到附件' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const db = createDatabase(join(root, 'nexus.db'));
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('session-attachment', '附件', Date.now(), Date.now(), Date.now());
    const attachments = new AttachmentService(db, join(root, 'attachments'));
    const attachment = await attachments.save({
      sessionId: 'session-attachment',
      name: 'notes.txt',
      mime: 'text/plain',
      content: Buffer.from('attachment content')
    });
    const service = new AgentService({
      createProvider: () => provider,
      database: db,
      attachmentBaseDir: join(root, 'attachments')
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
          sessionId: 'session-attachment',
          prompt: '看看附件',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model',
          attachmentIds: [attachment.id]
        },
        providerConfig,
        { onEvent: (event) => events.push(event) }
      );

      const currentPrompt = requests[0]?.messages.at(-1)?.content ?? '';
      expect(currentPrompt).toContain('<attachment name="notes.txt"');
      expect(currentPrompt).toContain('attachment content');
      expect(events[0]).toMatchObject({
        type: 'message.completed',
        payload: { role: 'user', attachments: [{ id: attachment.id, name: 'notes.txt' }] }
      });
    } finally {
      db.close();
    }
  });

  it('reloads historical attachment content for follow-up turns', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '已读取历史附件' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const db = createDatabase(join(root, 'nexus-history.db'));
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, last_active_at) VALUES (?, ?, ?, ?, ?)'
    ).run('session-history', '历史附件', Date.now(), Date.now(), Date.now());
    const attachments = new AttachmentService(db, join(root, 'history-attachments'));
    const attachment = await attachments.save({
      sessionId: 'session-history',
      name: 'history.txt',
      mime: 'text/plain',
      content: Buffer.from('historical attachment content')
    });
    const service = new AgentService({
      createProvider: () => provider,
      database: db,
      attachmentBaseDir: join(root, 'history-attachments')
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

    try {
      await service.run(
        {
          sessionId: 'session-history',
          prompt: '继续总结',
          rootPaths: [],
          providerId: providerConfig.id,
          modelId: 'mock-model'
        },
        providerConfig,
        {
          history: [{ role: 'user', content: '之前的问题', attachmentIds: [attachment.id] }]
        }
      );

      const historyContent = requests[0]?.messages[1]?.content ?? '';
      expect(historyContent).toContain('之前的问题');
      expect(historyContent).toContain('<attachment name="history.txt"');
      expect(historyContent).toContain('historical attachment content');
    } finally {
      db.close();
    }
  });
});
