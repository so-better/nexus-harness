/**
 * Agent 终端集成测试：Electron 环境下 run_command 走内置终端服务。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatProvider } from '@nexus/providers';
import type { NexusEvent } from '@shared/events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentService } from './agent-service';

const startCommand = vi.hoisted(() => vi.fn());
const readOutput = vi.hoisted(() => vi.fn(() => undefined));
vi.mock('../terminal/terminal-service', () => ({ terminalService: { startCommand, readOutput } }));

describe('AgentService terminal integration', () => {
  let root = '';
  let electronDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-agent-terminal-'));
    electronDescriptor = Object.getOwnPropertyDescriptor(process.versions, 'electron');
    Object.defineProperty(process.versions, 'electron', {
      value: 'test',
      configurable: true
    });
    startCommand.mockReset();
    readOutput.mockReset();
    readOutput.mockReturnValue(undefined);
    startCommand.mockReturnValue({
      terminal: { id: 'terminal-1', pid: 1234 },
      done: Promise.resolve({
        terminalId: 'terminal-1',
        output: 'hello\n',
        exitCode: 0,
        timedOut: false,
        truncated: false,
        closed: false
      })
    });
  });

  afterEach(async () => {
    if (electronDescriptor) Object.defineProperty(process.versions, 'electron', electronDescriptor);
    else delete (process.versions as { electron?: string }).electron;
    await rm(root, { recursive: true, force: true });
  });

  it('routes run_command through the built-in terminal service', async () => {
    let step = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream() {
        step += 1;
        if (step === 1) {
          const toolCall = {
            id: 'run-1',
            name: 'run_command',
            arguments: { command: 'echo hi' }
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
        yield { type: 'text-delta', text: '命令完成' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const events: NexusEvent[] = [];
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
        prompt: '执行命令',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      {
        terminalOwnerId: 7,
        approveTool: async () => true,
        onEvent: (event) => events.push(event)
      }
    );

    expect(startCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'echo hi', ownerId: 7, openView: false })
    );
    expect(events.some((event) => event.type === 'terminal.started')).toBe(true);
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: '命令完成' });
  });

  it('caps oversized run_command output and exposes terminalId', async () => {
    startCommand.mockReturnValue({
      terminal: { id: 'terminal-big', pid: 4321 },
      done: Promise.resolve({
        terminalId: 'terminal-big',
        output: 'x'.repeat(5_000),
        exitCode: 0,
        timedOut: false,
        truncated: false,
        closed: false
      })
    });

    let step = 0;
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream() {
        step += 1;
        if (step === 1) {
          const toolCall = {
            id: 'run-big',
            name: 'run_command',
            arguments: { command: 'cat big.log' }
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
        yield { type: 'text-delta', text: '完成' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const events: NexusEvent[] = [];
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

    await service.run(
      {
        sessionId: 'session-big',
        prompt: '执行命令',
        rootPaths: [root],
        providerId: providerConfig.id,
        modelId: 'mock-model'
      },
      providerConfig,
      { terminalOwnerId: 7, approveTool: async () => true, onEvent: (event) => events.push(event) }
    );

    const completed = events.find((event) => event.type === 'tool.completed');
    expect(completed?.payload).toMatchObject({
      artifactId: expect.any(String),
      bytes: expect.any(Number)
    });
    const output = JSON.parse((completed?.payload as { output: string }).output) as {
      truncated: boolean;
      terminalId: string;
      preview: string;
    };
    expect(output.truncated).toBe(true);
    expect(output.terminalId).toBe('terminal-big');
    expect(output.preview.length).toBeLessThanOrEqual(1_200);
  });
});
