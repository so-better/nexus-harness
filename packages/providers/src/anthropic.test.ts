/**
 * Anthropic Provider 测试：消息转换与 SSE 归一化。
 */

import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, toAnthropicMessages } from './anthropic';
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

  it('passes back signed assistant thinking blocks when reasoning passback is enabled', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: '',
        reasoning: '先检查工具结果',
        reasoningBlocks: [{ text: '先检查工具结果', signature: 'sig-1' }],
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
      },
      { role: 'tool' as const, toolCallId: 'call-1', content: 'ok' }
    ];

    const withPassback = toAnthropicMessages(messages, true);
    expect(withPassback.messages[0]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '先检查工具结果', signature: 'sig-1' },
        { type: 'tool_use', id: 'call-1', name: 'read_file' }
      ]
    });

    // 未启用时不注入 thinking 块
    const withoutPassback = toAnthropicMessages(messages);
    expect(withoutPassback.messages[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call-1', name: 'read_file' }]
    });

    // 无签名默认跳过（避免官方 Anthropic 400）
    const unsignedMessages = [
      {
        role: 'assistant' as const,
        content: '',
        reasoning: '无签名思考',
        toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
      }
    ];
    const unsigned = toAnthropicMessages(unsignedMessages, true);
    expect(unsigned.messages[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'call-1', name: 'read_file' }]
    });

    // 开启容错后，带无签名 thinking block 回传
    const forcedUnsigned = toAnthropicMessages(unsignedMessages, true, true);
    expect(forcedUnsigned.messages[0]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '无签名思考' },
        { type: 'tool_use', id: 'call-1', name: 'read_file' }
      ]
    });
  });

  it('passes back thinking blocks for the DeepSeek Anthropic endpoint with tools', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of [
            sse({ type: 'message_start', message: { usage: { input_tokens: 1 } } }),
            sse({
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 1 }
            }),
            sse({ type: 'message_stop' })
          ]) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKey: 'key',
      reasoningPassback: true,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    for await (const _event of provider.stream({
      model: 'deepseek-flash',
      messages: [
        {
          role: 'assistant',
          content: '',
          reasoning: '先读取文件',
          reasoningBlocks: [{ text: '先读取文件', signature: 'sig-abc' }],
          toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
        },
        { role: 'tool', toolCallId: 'call-1', content: '文件内容' }
      ],
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
    })) {
      // consume stream
    }

    const messages = requestBody?.['messages'] as Array<Record<string, unknown>>;
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '先读取文件', signature: 'sig-abc' },
        { type: 'tool_use', id: 'call-1', name: 'read_file' }
      ]
    });
    expect(messages[1]).toMatchObject({
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

  it('marks the last user message with a cache breakpoint', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of [
            sse({ type: 'message_start', message: { usage: { input_tokens: 3 } } }),
            sse({
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 1 }
            }),
            sse({ type: 'message_stop' })
          ]) {
            controller.enqueue(encoder.encode(chunk));
          }
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
    for await (const event of provider.stream({
      model: 'claude',
      messages: [
        { role: 'system', content: '规则' },
        { role: 'user', content: 'hi' }
      ]
    })) {
      if (event.type === 'finish') break;
    }

    const messages = requestBody?.['messages'] as Array<{ content: unknown }> | undefined;
    expect(messages?.[0]?.content).toEqual([
      { type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }
    ]);
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

  it('adds 1h ttl to cache breakpoints when configured', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
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
      cacheTtl: '1h',
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

    expect(events.length).toBeGreaterThan(0);
    expect((bodies[0]?.['system'] as Array<Record<string, unknown>>)[0]?.['cache_control']).toEqual(
      {
        type: 'ephemeral',
        ttl: '1h'
      }
    );
    expect((bodies[0]?.['tools'] as Array<Record<string, unknown>>)[0]?.['cache_control']).toEqual({
      type: 'ephemeral',
      ttl: '1h'
    });
    expect(JSON.stringify(bodies[0]?.['messages'])).toContain('"ttl":"1h"');
  });

  it('does not retry 4xx errors unrelated to prompt cache', async () => {
    const fetchImpl = vi.fn(async () => new Response('invalid model name', { status: 400 }));

    const provider = new AnthropicProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'claude',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'a', description: 'A', inputSchema: { type: 'object' } }]
    })) {
      events.push(event);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events.find((event) => event.type === 'error')).toMatchObject({
      code: 'PROVIDER_HTTP_400'
    });
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

  it('emits thinking and signature deltas', async () => {
    const fetchImpl = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          const chunks = [
            sse({ type: 'message_start', message: { usage: { input_tokens: 1 } } }),
            sse({
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'thinking' }
            }),
            sse({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'thinking_delta', thinking: '思考中' }
            }),
            sse({
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'signature_delta', signature: 'sig-abc' }
            }),
            sse({ type: 'content_block_stop', index: 0 }),
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
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: 'reasoning-delta', text: '思考中' });
    expect(events).toContainEqual({
      type: 'reasoning-block',
      block: { text: '思考中', signature: 'sig-abc' }
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
