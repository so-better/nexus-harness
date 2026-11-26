/**
 * OpenAI 兼容 Provider 测试：SSE 解析、工具调用、usage 与 HTTP 错误。
 */

import { describe, expect, it } from 'vitest';
import { OpenAICompatibleProvider } from './openai-compatible';
import type { ProviderStreamEvent } from './types';

const streamBody = (chunks: unknown[]): string =>
  `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;

describe('OpenAICompatibleProvider', () => {
  it('normalizes text, reasoning, tool calls and usage', async () => {
    let requestInit: RequestInit | undefined;
    const body = streamBody([
      { choices: [{ delta: { reasoning_content: '思考' } }] },
      { choices: [{ delta: { content: 'Hello' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'read_file', arguments: '{"path":' }
                }
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }]
            },
            finish_reason: 'tool_calls'
          }
        ]
      },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }
    ]);

    const fetchImpl: typeof fetch = async (_input, init) => {
      requestInit = init;
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1/',
      apiKey: 'secret',
      fetchImpl
    });

    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'mock-model',
      messages: [{ role: 'user', content: '读取 a.txt' }],
      tools: [{ name: 'read_file', description: '读取文件', inputSchema: { type: 'object' } }]
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: 'text-delta', text: 'Hello' });
    expect(events).toContainEqual({ type: 'reasoning-delta', text: '思考' });
    expect(events).toContainEqual({
      type: 'tool-call-end',
      toolCall: { id: 'call_1', name: 'read_file', arguments: { path: 'a.txt' } }
    });
    expect(events).toContainEqual({ type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(events).toContainEqual({ type: 'finish', reason: 'tool_calls' });

    const sentBody = JSON.parse(String(requestInit?.body));
    expect(sentBody.stream).toBe(true);
    expect(sentBody.tools[0].function.name).toBe('read_file');
  });

  it('records cached prompt tokens from OpenAI and DeepSeek usage shapes', async () => {
    const bodies = [
      streamBody([
        {
          choices: [],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 4,
            prompt_tokens_details: { cached_tokens: 12 }
          }
        }
      ]),
      streamBody([
        {
          choices: [],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 6,
            prompt_cache_hit_tokens: 18,
            prompt_cache_miss_tokens: 12
          }
        }
      ])
    ];

    let call = 0;
    const fetchImpl: typeof fetch = async () =>
      new Response(bodies[call++], {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      fetchImpl
    });

    const collect = async (): Promise<ProviderStreamEvent[]> => {
      const events: ProviderStreamEvent[] = [];
      for await (const event of provider.stream({
        model: 'mock-model',
        messages: [{ role: 'user', content: 'hi' }]
      })) {
        events.push(event);
      }
      return events;
    };

    const openai = await collect();
    expect(openai).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 20, outputTokens: 4, cacheReadTokens: 12 }
    });

    const deepseek = await collect();
    expect(deepseek).toContainEqual({
      type: 'usage',
      usage: { inputTokens: 30, outputTokens: 6, cacheReadTokens: 18 }
    });
  });

  it('passes assistant reasoning_content back when the provider requires it', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'secret',
      reasoningPassback: true,
      fetchImpl
    });
    for await (const _event of provider.stream({
      model: 'deepseek-flash',
      messages: [
        {
          role: 'assistant',
          content: '',
          reasoning: '先检查工具结果',
          toolCalls: [{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }]
        },
        { role: 'tool', toolCallId: 'call-1', content: 'hello' }
      ],
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
    })) {
      // consume stream
    }

    const messages = sentBody?.['messages'] as Array<Record<string, unknown>>;
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      reasoning_content: '先检查工具结果'
    });
  });

  it('does not pass back reasoning when no tools are present', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'secret',
      reasoningPassback: true,
      fetchImpl
    });
    const messages = Array.from({ length: 10 }, (_value, index) => ({
      role: 'assistant' as const,
      content: `c${index}`,
      reasoning: `r${index}`
    }));
    for await (const _event of provider.stream({
      model: 'deepseek-flash',
      messages
    })) {
      // consume stream
    }

    const sent = sentBody?.['messages'] as Array<Record<string, unknown>>;
    // 不带 tools 时完全不回传 reasoning
    for (const message of sent) {
      expect(message).not.toHaveProperty('reasoning_content');
    }
  });

  it('passes back all reasoning when tools are present', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'secret',
      reasoningPassback: true,
      fetchImpl
    });
    const messages = Array.from({ length: 10 }, (_value, index) => ({
      role: 'assistant' as const,
      content: `c${index}`,
      reasoning: `r${index}`
    }));
    for await (const _event of provider.stream({
      model: 'deepseek-flash',
      messages,
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
    })) {
      // consume stream
    }

    const sent = sentBody?.['messages'] as Array<Record<string, unknown>>;
    // 携带 tools 时 DeepSeek 要求全部历史 reasoning 回传，不能只发最近 8 条
    for (let index = 0; index < 10; index += 1) {
      expect(sent[index]?.['reasoning_content']).toBe(`r${index}`);
    }
  });

  it('uses a custom reasoning field name', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      reasoningPassback: true,
      reasoningField: (model) => (model === 'model-a' ? 'reasoning' : 'reasoning_content'),
      fetchImpl
    });
    for await (const _event of provider.stream({
      model: 'model-a',
      messages: [{ role: 'assistant', content: '', reasoning: '思考' }],
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object' } }]
    })) {
      // consume stream
    }

    const messages = sentBody?.['messages'] as Array<Record<string, unknown>>;
    expect(messages[0]?.['reasoning']).toBe('思考');
    expect(messages[0]).not.toHaveProperty('reasoning_content');
  });

  it('does not send reasoning_content when the provider does not require it', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      fetchImpl
    });
    for await (const _event of provider.stream({
      model: 'mock-model',
      messages: [{ role: 'assistant', content: '', reasoning: '思考' }]
    })) {
      // consume stream
    }

    const messages = sentBody?.['messages'] as Array<Record<string, unknown>>;
    expect(messages[0]).not.toHaveProperty('reasoning_content');
  });

  it('sends image content as data-url parts', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      fetchImpl
    });
    for await (const _event of provider.stream({
      model: 'vision-model',
      messages: [
        {
          role: 'user',
          content: '看看这张图',
          images: [{ mimeType: 'image/png', data: 'aGVsbG8=' }]
        }
      ]
    })) {
      // consume stream
    }

    const messages = sentBody?.['messages'] as Array<{ content: unknown[] }>;
    expect(messages[0]?.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,aGVsbG8=' }
    });
  });

  it('does not allow extra params to override protocol fields', async () => {
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(streamBody([{ choices: [{ delta: { content: 'ok' } }] }]), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      });
    };
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      fetchImpl
    });
    for await (const _event of provider.stream({
      model: 'safe-model',
      messages: [{ role: 'user', content: 'hi' }],
      extraParams: {
        model: 'overridden-model',
        messages: [],
        api_key: 'secret',
        thinking: { type: 'enabled' }
      }
    })) {
      // consume stream
    }

    expect(sentBody?.['model']).toBe('safe-model');
    expect(sentBody?.['messages'] as Array<unknown>).toHaveLength(1);
    expect(sentBody?.['thinking']).toEqual({ type: 'enabled' });
    expect(sentBody).not.toHaveProperty('api_key');
  });

  it('maps HTTP failures to provider errors', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response('unauthorized', { status: 401, headers: { 'content-type': 'text/plain' } });
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      fetchImpl
    });

    const events: ProviderStreamEvent[] = [];
    for await (const event of provider.stream({
      model: 'mock-model',
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      events.push(event);
    }

    expect(events[0]).toMatchObject({ type: 'error', code: 'PROVIDER_HTTP_401' });
  });
});
