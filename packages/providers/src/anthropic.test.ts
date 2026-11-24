/**
 * Anthropic Provider 测试：消息转换与 SSE 归一化。
 */

import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, toAnthropicMessages } from './anthropic';
import { normalizeOllamaBaseUrl } from './ollama';
import type { ProviderStreamEvent } from './types';

const sse = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

describe('AnthropicProvider', () => {
  it('converts tool results into user content blocks', () => {
    const converted = toAnthropicMessages([
      { role: 'system', content: '规则' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
      },
      { role: 'tool', toolCallId: 'call-1', content: '文件内容' }
    ]);

    expect(converted.system).toBe('规则');
    expect(converted.messages[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call-1', name: 'read_file' }]
    });
    expect(converted.messages[1]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'call-1', content: '文件内容' }]
    });
  });

  it('converts image messages into Anthropic image blocks', () => {
    const converted = toAnthropicMessages([
      {
        role: 'user',
        content: '看看这张图',
        images: [{ mimeType: 'image/jpeg', data: 'aGVsbG8=' }]
      }
    ]);
    expect(converted.messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: '看看这张图' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'aGVsbG8=' }
        }
      ]
    });
  });

  it('normalizes Ollama base urls', () => {
    expect(normalizeOllamaBaseUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/v1');
    expect(normalizeOllamaBaseUrl('http://127.0.0.1:11434/v1/')).toBe('http://127.0.0.1:11434/v1');
  });

  it('adds prompt cache control and counts cache tokens in usage', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const chunks = [
        sse({
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 10,
              cache_creation_input_tokens: 5,
              cache_read_input_tokens: 7
            }
          }
        }),
        sse({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text' }
        }),
        sse({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' }
        }),
        sse({ type: 'content_block_stop', index: 0 }),
        sse({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 3 }
        }),
        sse({ type: 'message_stop' })
      ];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });

    const provider = new AnthropicProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'claude',
      messages: [
        { role: 'system', content: '规则' },
        { role: 'user', content: 'hi' }
      ],
      tools: [
        { name: 'a', description: 'A', inputSchema: { type: 'object' } },
        { name: 'b', description: 'B', inputSchema: { type: 'object' } }
      ]
    })) {
      events.push(event);
    }

    const system = requestBody?.['system'] as Array<Record<string, unknown>> | undefined;
    expect(system?.[0]).toMatchObject({
      type: 'text',
      text: '规则',
      cache_control: { type: 'ephemeral' }
    });
    const tools = requestBody?.['tools'] as Array<Record<string, unknown>>;
    expect(tools[0]?.['cache_control']).toBeUndefined();
    expect(tools[1]?.['cache_control']).toEqual({ type: 'ephemeral' });

    const usage = events.find((event) => event.type === 'usage');
    expect(usage?.usage.inputTokens).toBe(22);
    expect(usage?.usage.cacheWriteTokens).toBe(5);
    expect(usage?.usage.cacheReadTokens).toBe(7);
  });

  it('retries without cache control when the endpoint rejects it', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let call = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      if (call === 1) return new Response('cache_control unsupported', { status: 400 });
      const chunks = [
        sse({ type: 'message_start', message: { usage: { input_tokens: 3 } } }),
        sse({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 }
        }),
        sse({ type: 'message_stop' })
      ];
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });

    const provider = new AnthropicProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'claude',
      messages: [
        { role: 'system', content: '规则' },
        { role: 'user', content: 'hi' }
      ],
      tools: [{ name: 'a', description: 'A', inputSchema: { type: 'object' } }]
    })) {
      events.push(event);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((bodies[0]?.['system'] as Array<Record<string, unknown>>)[0]?.['cache_control']).toEqual(
      {
        type: 'ephemeral'
      }
    );
    expect(bodies[1]?.['system']).toBe('规则');
    expect((bodies[0]?.['tools'] as Array<Record<string, unknown>>)[0]?.['cache_control']).toEqual({
      type: 'ephemeral'
    });
    expect(
      (bodies[1]?.['tools'] as Array<Record<string, unknown>>)[0]?.['cache_control']
    ).toBeUndefined();
  });

  it('keeps malformed tool arguments as a structured value', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          const chunks = [
            sse({ type: 'message_start', message: { usage: { input_tokens: 1 } } }),
            sse({
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file' }
            }),
            sse({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'input_json_delta', partial_json: '{bad' }
            }),
            sse({ type: 'content_block_stop', index: 0 }),
            sse({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
            sse({ type: 'message_stop' })
          ];
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'secret',
      fetchImpl: fetchImpl as typeof fetch
    });
    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'claude-test',
      messages: [{ role: 'user', content: '读取' }]
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'tool-call-end',
      toolCall: {
        id: 'tool-1',
        name: 'read_file',
        arguments: { __invalidArguments: '{bad' }
      }
    });
  });

  it('normalizes text, usage and finish events', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          const chunks = [
            sse({ type: 'message_start', message: { usage: { input_tokens: 3 } } }),
            sse({
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' }
            }),
            sse({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: '你' }
            }),
            sse({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: '好' }
            }),
            sse({ type: 'content_block_stop', index: 0 }),
            sse({
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 2 }
            }),
            sse({ type: 'message_stop' })
          ];
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'secret',
      fetchImpl: fetchImpl as typeof fetch
    });
    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'claude-test',
      messages: [{ role: 'user', content: '你好' }]
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: 'text-delta', text: '你' });
    expect(events).toContainEqual({ type: 'text-delta', text: '好' });
    expect(events).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 3, outputTokens: 2 }
    });
    expect(events).toContainEqual({ type: 'finish', reason: 'end_turn' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'secret' })
      })
    );
  });
});
