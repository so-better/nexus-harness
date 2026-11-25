/**
 * 上下文服务测试：工具输出落盘、摘要压缩与硬截断兜底。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatMessage, ChatProvider, ProviderRequest } from '@nexus/providers';
import { MockProvider } from '@nexus/providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactService } from '../artifacts/artifact-service';
import { AgentContextService } from './context-service';

const user = (content: string): ChatMessage => ({ role: 'user', content });
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('AgentContextService', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-context-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const createService = (provider: ChatProvider = new MockProvider(), maxOutputTokens = 1024) =>
    new AgentContextService({
      provider,
      model: 'mock-model',
      contextWindow: 4_096,
      maxOutputTokens,
      artifacts: new ArtifactService(directory),
      sessionId: 'session-1'
    });

  it('leaves small contexts unchanged', async () => {
    const service = createService();
    const messages = [user('hello'), assistant('world')];

    const result = await service.prepare(messages);

    expect(result.messages).toBe(messages);
    expect(result.compacted).toBeUndefined();
  });

  it('uses real usage to correct token underestimation before overflow', async () => {
    const service = createService();
    const messages: ChatMessage[] = [user('a'.repeat(3_000)), assistant('b'.repeat(3_000))];

    // 首次准备建立“上次估算”，此时还没有真实 usage
    const first = await service.prepare(messages);
    expect(first.compacted).toBeUndefined();

    // 真实输入远高于字符估算时，校准后应提前压缩，而不是等到真实超窗
    const second = await service.prepare(messages, undefined, 6_000);
    expect(second.compacted).toBe(true);
    expect(second.strategies).toContain('hard_truncated');
  });

  it('does not re-compact read_artifact slice outputs', async () => {
    const service = new AgentContextService({
      provider: new MockProvider(),
      model: 'mock-model',
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      artifacts: new ArtifactService(directory),
      sessionId: 'session-1'
    });
    const slice = JSON.stringify({
      kind: 'artifact_slice',
      artifactId: 'art-1',
      content: 'x'.repeat(5_000),
      truncated: true
    });
    const messages: ChatMessage[] = [
      user('a'.repeat(80_000)),
      { role: 'tool', toolCallId: 'call-1', content: slice },
      assistant('ok')
    ];

    const result = await service.prepare(messages);

    // 产物分片不再被落 Artifact 层层包裹
    expect(result.messages.find((message) => message.toolCallId === 'call-1')?.content).toBe(slice);
    expect(result.strategies ?? []).not.toContain('tool_output_truncated');
  });

  it('moves oversized tool output to an artifact and keeps a preview', async () => {
    const service = createService();
    const messages: ChatMessage[] = [
      user('读取大文件'),
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: 'x'.repeat(20_000)
      }
    ];

    const result = await service.prepare(messages);
    const toolMessage = result.messages.at(-1);

    expect(result.compacted).toBe(true);
    expect(result.snapshotRef).toBeTruthy();
    expect(result.artifactIds).toHaveLength(1);
    expect(toolMessage?.content).toContain('"truncated":true');
    expect(toolMessage?.content.length).toBeLessThan(2_000);
  });

  it('truncates older tool output before the most recent one', async () => {
    const service = createService();
    const messages: ChatMessage[] = [
      user('读取两个文件'),
      { role: 'tool', toolCallId: 'old', content: 'a'.repeat(8_000) },
      assistant('已读取第一个'),
      { role: 'tool', toolCallId: 'recent', content: 'b'.repeat(2_000) }
    ];

    const result = await service.prepare(messages);
    const oldMessage = result.messages.find((message) => message.toolCallId === 'old');
    const recentMessage = result.messages.find((message) => message.toolCallId === 'recent');

    // 旧输出先落 Artifact 并给出回读提示
    expect(oldMessage?.content).toContain('"truncated":true');
    expect(oldMessage?.content).toContain('read_artifact');
    expect(result.strategies).toContain('tool_output_truncated');
    // 最近一轮工具输出仍保留原文
    expect(recentMessage?.content).toBe('b'.repeat(2_000));
    expect(result.strategies).not.toContain('recent_tool_truncated');
  });

  it('summarizes older messages and stores the summary artifact', async () => {
    const provider = new MockProvider([
      { text: '摘要：用户要求处理大任务。', usage: { inputTokens: 100, outputTokens: 20 } }
    ]);
    const service = createService(provider);
    const messages: ChatMessage[] = [
      user('目标：完成一个很长的任务'),
      assistant('a'.repeat(1_000)),
      user('b'.repeat(1_000)),
      assistant('c'.repeat(1_000)),
      user('d'.repeat(1_000)),
      assistant('e'.repeat(1_000)),
      user('f'.repeat(1_000)),
      assistant('g'.repeat(1_000)),
      user('h'.repeat(1_000)),
      assistant('完成')
    ];

    const result = await service.prepare(messages);

    expect(result.compacted).toBe(true);
    expect(result.strategies).toContain('summarized');
    expect(result.summaryRef).toBeTruthy();
    expect(result.snapshotRef).toBeTruthy();
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(result.messages[0]).toEqual(messages[0]);
    expect(result.messages[1]?.role).toBe('user');
    expect(result.messages[1]?.content).toContain('不可信摘要');
    expect(result.messages[1]?.content).toContain('摘要');
  });

  it('keeps reasoning on retained assistant tool-call messages', async () => {
    const provider = new MockProvider([{ text: '摘要内容' }]);
    const service = createService(provider);
    const messages: ChatMessage[] = [
      user('最初目标'),
      ...Array.from({ length: 7 }, (_, index) => assistant(`${index}`.repeat(1_000))),
      user('最新问题'),
      {
        role: 'assistant',
        content: '',
        reasoning: '工具调用前的思考必须保留',
        toolCalls: [{ id: 'call-keep', name: 'read_file', arguments: { path: 'a.txt' } }]
      },
      { role: 'tool', toolCallId: 'call-keep', content: 'result' }
    ];

    const result = await service.prepare(messages);
    const retained = result.messages.find((message) =>
      message.toolCalls?.some((call) => call.id === 'call-keep')
    );

    expect(retained?.reasoning).toBe('工具调用前的思考必须保留');
  });

  it('keeps the latest user message out of the summary', async () => {
    const provider = new MockProvider([{ text: '摘要内容' }]);
    const service = createService(provider);
    const messages: ChatMessage[] = [
      user('最初目标'),
      assistant('a'.repeat(4_000)),
      user('b'.repeat(4_000)),
      assistant('c'.repeat(4_000)),
      user('d'.repeat(4_000)),
      assistant('e'.repeat(4_000)),
      user('f'.repeat(4_000)),
      assistant('g'.repeat(4_000)),
      user('LATEST'),
      assistant('h'.repeat(4_000)),
      assistant('i'.repeat(4_000)),
      assistant('j'.repeat(4_000))
    ];

    const result = await service.prepare(messages);

    expect(result.strategies).toContain('summarized');
    expect(result.messages.some((message) => message.content === 'LATEST')).toBe(true);
  });

  it('includes tool arguments and approval status in summary input', async () => {
    const requests: ProviderRequest[] = [];
    const provider: ChatProvider = {
      capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: '摘要内容' };
        yield { type: 'finish', reason: 'stop' };
      }
    };
    const service = createService(provider);
    const messages: ChatMessage[] = [
      user('读取文件'),
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
      },
      { role: 'tool', toolCallId: 'call-1', content: 'hello', approvalStatus: 'approved' },
      assistant('a'.repeat(4_000)),
      user('b'.repeat(4_000)),
      assistant('c'.repeat(4_000)),
      user('d'.repeat(4_000)),
      assistant('e'.repeat(4_000)),
      user('f'.repeat(4_000)),
      assistant('g'.repeat(4_000))
    ];

    await service.prepare(messages);

    expect(requests[0]?.messages[1]?.content).toContain('path=a.txt');
    expect(requests[0]?.messages[1]?.content).toContain('审批：已批准');
  });

  it('degrades to a short preview when artifact writing fails', async () => {
    const artifacts = {
      saveText: async () => {
        throw new Error('disk full');
      }
    };
    const service = new AgentContextService({
      provider: new MockProvider(),
      model: 'mock-model',
      contextWindow: 4_096,
      maxOutputTokens: 1_024,
      artifacts: artifacts as unknown as ArtifactService,
      sessionId: 'session-1'
    });
    const messages: ChatMessage[] = [
      user('读取大文件'),
      { role: 'tool', toolCallId: 'call-1', content: 'x'.repeat(20_000) }
    ];

    const result = await service.prepare(messages);

    expect(result.strategies).toContain('artifact_save_failed');
    expect(result.messages.at(-1)?.content).toContain('产物保存失败');
  });

  it('falls back to hard truncation when summary fails', async () => {
    const provider = new MockProvider([
      {
        usage: { inputTokens: 10, outputTokens: 0 },
        error: { code: 'PROVIDER_ERROR', message: '总结失败' }
      }
    ]);
    const service = createService(provider);
    const messages: ChatMessage[] = [
      user('a'.repeat(1_000)),
      assistant('b'.repeat(4_000)),
      user('c'.repeat(4_000)),
      assistant('d'.repeat(4_000)),
      user('e'.repeat(4_000)),
      assistant('f'.repeat(4_000)),
      user('g'.repeat(4_000)),
      assistant('h'.repeat(4_000))
    ];

    const result = await service.prepare(messages);

    expect(result.strategies).toContain('summary_failed');
    expect(result.strategies).toContain('hard_truncated');
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 0 });
    expect(result.afterTokens).toBeLessThanOrEqual(2_560);
  });

  it('truncates oversized reasoning during hard truncation', async () => {
    const service = createService();
    const messages: ChatMessage[] = [
      user('目标'),
      { role: 'assistant', content: 'a'.repeat(8_000), reasoning: 'r'.repeat(8_000) }
    ];

    const result = await service.prepare(messages);
    const assistant = result.messages.at(-1);

    expect(result.strategies).toContain('hard_truncated');
    expect(assistant?.content).toContain('…[已截断]');
    expect(assistant?.reasoning).toContain('…[已截断]');
    expect(result.afterTokens).toBeLessThanOrEqual(result.beforeTokens ?? Number.MAX_SAFE_INTEGER);
  });

  it('throws when protected user messages alone exceed the budget', async () => {
    const service = createService();
    const messages = [user('x'.repeat(100_000)), assistant('ok')];

    await expect(service.prepare(messages)).rejects.toThrow('上下文仍超出预算');
  });
});
