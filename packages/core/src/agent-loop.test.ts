/* Agent 循环测试：工具调用、结果回填、失败回填与最大步骤。 */

import type { NexusEvent } from '@nexus/shared';
import { MockProvider, type ChatProvider, type ProviderRequest } from '@nexus/providers';
import { describe, expect, it, vi } from 'vitest';
import { AgentLoop } from './agent-loop';
import { EventBus } from './event-bus';
import { PermissionGateway } from './permissions';

const writeTool = {
  name: 'write_file',
  description: '写入文件',
  inputSchema: {},
  permission: 'write' as const,
  requiresApproval: true
};

const readTool = {
  name: 'read_file',
  description: '读取文件',
  inputSchema: {},
  permission: 'read' as const,
  requiresApproval: false
};

const eventTypes = [
  'run.started',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'message.completed',
  'tool.requested',
  'tool.completed',
  'tool.failed',
  'usage.recorded',
  'approval.requested',
  'approval.resolved',
  'context.compacted',
  'checkpoint.created',
  'checkpoint.restored'
] as const;

const createCollector = () => {
  const events: NexusEvent[] = [];
  const bus = new EventBus(() => undefined);
  for (const type of eventTypes) {
    bus.subscribe(type, (event) => events.push(event));
  }
  return { bus, events };
};

describe('AgentLoop', () => {
  it('executes tools and continues until the model stops', async () => {
    const { bus, events } = createCollector();
    const provider = new MockProvider([
      {
        text: '我先读取文件',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: '文件内容是 hello', finishReason: 'stop' }
    ]);
    const executeTool = vi.fn().mockResolvedValue({ ok: true, output: 'hello' });

    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      runId: 'run-1',
      messages: [{ role: 'user', content: '读取 a.txt' }],
      tools: [readTool],
      permissionGateway: new PermissionGateway(['read']),
      executeTool,
      eventBus: bus
    });

    const result = await loop.run();

    expect(result.steps).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(result.finishReason).toBe('stop');
    expect(result.messages).toHaveLength(4);
    expect(result.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '文件内容是 hello'
    });
    expect(
      result.messages.some((message) => message.role === 'tool' && message.content === 'hello')
    ).toBe(true);
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'message.completed',
      'tool.requested',
      'tool.completed',
      'message.completed',
      'run.completed'
    ]);
  });

  it('feeds tool failures back to the model', async () => {
    const { bus, events } = createCollector();
    const provider = new MockProvider([
      {
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'missing.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: '文件不存在', finishReason: 'stop' }
    ]);
    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '读取文件' }],
      tools: [readTool],
      permissionGateway: new PermissionGateway(['read']),
      executeTool: async () => ({
        ok: false,
        output: '',
        error: { code: 'FILE_NOT_FOUND', message: '文件不存在' }
      }),
      eventBus: bus
    });

    const result = await loop.run();

    expect(result.finishReason).toBe('stop');
    expect(result.messages.some((message) => message.role === 'tool')).toBe(true);
    expect(events.some((event) => event.type === 'tool.failed')).toBe(true);
  });

  it('reports cancellation when aborted mid-stream', async () => {
    const { bus, events } = createCollector();
    const controller = new AbortController();
    const provider: ChatProvider = {
      capabilities: {
        streaming: true,
        toolCalling: false,
        vision: true,
        reasoning: false
      },
      async *stream(request) {
        yield { type: 'text-delta', text: 'partial' };
        await new Promise<void>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
    };

    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '停止' }],
      eventBus: bus,
      signal: controller.signal
    });

    setTimeout(() => controller.abort(), 0);
    const result = await loop.run();

    expect(result.finishReason).toBe('aborted');
    expect(events.some((event) => event.type === 'run.cancelled')).toBe(true);
    expect(events.some((event) => event.type === 'run.failed')).toBe(false);
  });

  it('denies tools when permission is missing', async () => {
    const { bus, events } = createCollector();
    const provider = new MockProvider([
      {
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: {} }],
        finishReason: 'tool_calls'
      }
    ]);
    const executeTool = vi.fn();

    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '读取文件' }],
      tools: [readTool],
      permissionGateway: new PermissionGateway([]),
      executeTool,
      eventBus: bus
    });

    await loop.run();

    expect(executeTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'tool.failed')).toBe(true);
  });

  it('requests and resolves approval before executing a tool', async () => {
    const { bus, events } = createCollector();
    const provider = new MockProvider([
      {
        toolCalls: [{ id: 'call-1', name: 'write_file', arguments: { path: 'a.txt' } }],
        finishReason: 'tool_calls'
      },
      { text: '写入完成', finishReason: 'stop' }
    ]);
    const executeTool = vi.fn().mockResolvedValue({ ok: true, output: 'written' });
    const approveTool = vi.fn().mockResolvedValue(true);

    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '写文件' }],
      tools: [writeTool],
      permissionGateway: new PermissionGateway(['write']),
      approveTool,
      executeTool,
      eventBus: bus
    });

    const result = await loop.run();

    expect(result.messages.find((message) => message.role === 'tool')?.approvalStatus).toBe(
      'approved'
    );
    expect(approveTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === 'approval.requested')).toBe(true);
    expect(events.some((event) => event.type === 'approval.resolved')).toBe(true);
  });

  it('prepares context before each model call and records compacted usage', async () => {
    const { bus, events } = createCollector();
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: false, vision: true, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const prepareContext = vi.fn().mockResolvedValue({
      messages: [{ role: 'user', content: '压缩后的上下文' }],
      compacted: true,
      beforeTokens: 1000,
      afterTokens: 100,
      strategies: ['summarized'],
      summaryRef: 'artifact-1',
      usage: { inputTokens: 20, outputTokens: 10 }
    });

    const loop = new AgentLoop({
      provider,
      providerName: 'mock-provider',
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '很长的历史' }],
      prepareContext,
      eventBus: bus
    });

    await loop.run();

    expect(requests[0]?.messages).toEqual([{ role: 'user', content: '压缩后的上下文' }]);
    expect(events.some((event) => event.type === 'context.compacted')).toBe(true);
    expect(events.some((event) => event.type === 'usage.recorded')).toBe(true);
  });

  it('fails the run when context preparation fails', async () => {
    const { bus, events } = createCollector();
    const loop = new AgentLoop({
      provider: new MockProvider([{ text: '不会执行', finishReason: 'stop' }]),
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '任务' }],
      prepareContext: async () => {
        throw new Error('预算不足');
      },
      eventBus: bus
    });

    await expect(loop.run()).rejects.toThrow('预算不足');
    expect(events.some((event) => event.type === 'run.failed')).toBe(true);
  });

  it('stops at max steps', async () => {
    const { bus, events } = createCollector();
    const provider = new MockProvider([
      {
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: {} }],
        finishReason: 'tool_calls'
      }
    ]);

    const loop = new AgentLoop({
      provider,
      model: 'mock-model',
      sessionId: 'session-1',
      messages: [{ role: 'user', content: '循环' }],
      tools: [readTool],
      permissionGateway: new PermissionGateway(['read']),
      maxSteps: 1,
      executeTool: async () => ({ ok: true, output: 'ok' }),
      eventBus: bus
    });

    const result = await loop.run();

    expect(result.finishReason).toBe('max_steps');
    expect(events.some((event) => event.type === 'run.failed')).toBe(true);
  });
});
