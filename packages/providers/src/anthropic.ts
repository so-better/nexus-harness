/**
 * Anthropic Messages API Provider：把 SSE 事件归一化为统一流式事件。
 */

import type { UsageSummary } from '@nexus/shared';
import { sanitizeProviderParams } from '@nexus/shared';
import type {
  ChatMessage,
  ChatProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderToolCall,
  ToolSchema
} from './types';

export interface AnthropicConfig {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  capabilities?: Partial<ProviderCapabilities>;
  /** DeepSeek 等 Anthropic 兼容端点：带 tools 时回传历史 thinking 内容 */
  reasoningPassback?: boolean;
  fetchImpl?: typeof fetch;
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  toolCalling: true,
  vision: true,
  reasoning: true
};

const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  cache_control?: { type: 'ephemeral' };
  thinking?: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicConversion {
  system: string;
  messages: AnthropicMessage[];
}

const endpoint = (baseUrl: string): string => {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
};

/**
 * 把统一消息转换为 Anthropic system 与 messages；工具结果合并进 user 消息。
 */
export const toAnthropicMessages = (
  messages: readonly ChatMessage[],
  passReasoning = false
): AnthropicConversion => {
  const system: string[] = [];
  const result: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content.trim()) system.push(message.content);
      continue;
    }

    if (message.role === 'tool') {
      const block: AnthropicContentBlock = {
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: message.content
      };
      const previous = result.at(-1);
      if (previous?.role === 'user' && Array.isArray(previous.content)) {
        previous.content.push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (message.images?.length) {
      const content: AnthropicContentBlock[] = [];
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const image of message.images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mimeType, data: image.data }
        });
      }
      result.push({ role: message.role, content });
      continue;
    }

    if (message.role === 'assistant' && (message.toolCalls?.length || (passReasoning && message.reasoning?.trim()))) {
      const content: AnthropicContentBlock[] = [];
      // DeepSeek 等 Anthropic 兼容端点在工具调用时要求回传完整 thinking 内容
      if (passReasoning && message.reasoning?.trim()) {
        content.push({ type: 'thinking', thinking: message.reasoning });
      }
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.arguments ?? {}
        });
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    result.push({ role: message.role, content: message.content });
  }

  return { system: system.join('\n\n'), messages: result };
};

/**
 * 在最后一条 user 消息的最后一个内容块打 cache_control，让多步工具循环复用会话前缀缓存。
 */
const withMessageCacheBreakpoint = (messages: AnthropicMessage[]): AnthropicMessage[] => {
  let index = -1;
  for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user') {
      index = cursor;
      break;
    }
  }
  if (index < 0) return messages;

  const target = messages[index];
  if (!target) return messages;

  const marker = { cache_control: { type: 'ephemeral' as const } };
  let content: AnthropicMessage['content'] | undefined;
  if (Array.isArray(target.content)) {
    if (target.content.length === 0) return messages;
    content = target.content.map((block, blockIndex) =>
      blockIndex === target.content.length - 1 ? { ...block, ...marker } : block
    );
  } else if (target.content) {
    content = [{ type: 'text', text: target.content, ...marker }];
  }
  if (content === undefined) return messages;

  return messages.map((message, messageIndex) =>
    messageIndex === index ? { ...target, content } : message
  );
};

const toAnthropicTool = (tool: ToolSchema): Record<string, unknown> => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema
});

/**
 * 安全解析流式工具参数；非法 JSON 保留原始文本，交由工具层返回结构化错误。
 */
const parseToolArguments = (text: string): unknown => {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { __invalidArguments: text };
  }
};

/**
 * Anthropic 原生流式实现；只依赖标准 fetch。
 */
export class AnthropicProvider implements ChatProvider {
  readonly capabilities: ProviderCapabilities;

  private readonly config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...config.capabilities };
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const converted = toAnthropicMessages(
      request.messages,
      this.config.reasoningPassback === true
    );
    const endpointUrl = endpoint(this.config.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      ...this.config.headers
    };

    // 稳定前缀缓存：system、工具块与最后一条 user 消息加 ephemeral 断点；
    // 多步工具循环下，上一步的消息前缀可被下一步复用。
    const buildBody = (usePromptCache: boolean): string => {
      const tools = request.tools?.map((tool, index) => ({
        ...toAnthropicTool(tool),
        ...(usePromptCache && index === (request.tools?.length ?? 0) - 1
          ? { cache_control: { type: 'ephemeral' } }
          : {})
      }));
      return JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
        ...(converted.system
          ? {
              system: usePromptCache
                ? [{ type: 'text', text: converted.system, cache_control: { type: 'ephemeral' } }]
                : converted.system
            }
          : {}),
        messages: usePromptCache
          ? withMessageCacheBreakpoint(converted.messages)
          : converted.messages,
        ...(tools?.length ? { tools } : {}),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...sanitizeProviderParams(request.extraParams)
      });
    };

    const requestInit = (body: string): RequestInit => ({
      method: 'POST',
      headers,
      body,
      ...(request.signal ? { signal: request.signal } : {})
    });

    let response = await fetchImpl(endpointUrl, requestInit(buildBody(true)));
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      const status = response.status;
      const detail = (await response.text().catch(() => '')).slice(0, 2000);
      // 只在错误明确指向 prompt cache 时才去掉 cache_control 重试，避免对无关 4xx 重复请求
      if (/cache[_ ]?control|prompt[ _]?cach/i.test(detail)) {
        response = await fetchImpl(endpointUrl, requestInit(buildBody(false)));
      } else {
        yield {
          type: 'error',
          code: `PROVIDER_HTTP_${status}`,
          message: detail || `模型服务返回 HTTP ${status}`
        };
        return;
      }
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 2000);
      yield {
        type: 'error',
        code: `PROVIDER_HTTP_${response.status}`,
        message: detail || `模型服务返回 HTTP ${response.status}`
      };
      return;
    }
    if (!response.body) {
      yield { type: 'error', code: 'PROVIDER_EMPTY_BODY', message: '模型服务未返回流式响应' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, { id: string; name: string; argumentsText: string }>();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheWriteTokens = 0;
    let cacheReadTokens = 0;
    let finishReason = 'end_turn';
    let done = false;

    const processData = (payload: string): ProviderStreamEvent[] => {
      if (!payload || payload === '[DONE]') return [];
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return [];
      }

      const events: ProviderStreamEvent[] = [];
      const type = data['type'];

      if (type === 'message_start') {
        const message = data['message'];
        if (message && typeof message === 'object') {
          const usage = (message as { usage?: Record<string, unknown> }).usage;
          if (usage) {
            const freshInput = Number(usage['input_tokens'] ?? 0);
            cacheWriteTokens = Number(usage['cache_creation_input_tokens'] ?? 0);
            cacheReadTokens = Number(usage['cache_read_input_tokens'] ?? 0);
            // inputTokens 维持总输入（含缓存），并单独记录缓存读写便于统计命中率
            inputTokens = freshInput + cacheWriteTokens + cacheReadTokens;
          }
        }
        return events;
      }

      if (type === 'content_block_start') {
        const index = Number(data['index'] ?? 0);
        const block = data['content_block'];
        if (
          block &&
          typeof block === 'object' &&
          (block as { type?: string }).type === 'tool_use'
        ) {
          const tool = block as { id?: string; name?: string };
          const entry = {
            id: tool.id ?? `tool_${index}`,
            name: tool.name ?? '',
            argumentsText: ''
          };
          toolCalls.set(index, entry);
          events.push({ type: 'tool-call-start', id: entry.id, name: entry.name });
        }
        return events;
      }

      if (type === 'content_block_delta') {
        const index = Number(data['index'] ?? 0);
        const delta = data['delta'];
        if (!delta || typeof delta !== 'object') return events;
        const typed = delta as {
          type?: string;
          text?: string;
          partial_json?: string;
          thinking?: string;
        };
        if (typed.type === 'text_delta' && typed.text) {
          events.push({ type: 'text-delta', text: typed.text });
        } else if (typed.type === 'input_json_delta' && typed.partial_json) {
          const entry = toolCalls.get(index);
          if (entry) {
            entry.argumentsText += typed.partial_json;
            events.push({
              type: 'tool-call-delta',
              id: entry.id,
              argumentsDelta: typed.partial_json
            });
          }
        } else if (typed.type === 'thinking_delta' && typed.thinking) {
          events.push({ type: 'reasoning-delta', text: typed.thinking });
        }
        return events;
      }

      if (type === 'content_block_stop') {
        const index = Number(data['index'] ?? 0);
        const entry = toolCalls.get(index);
        if (entry) {
          events.push({
            type: 'tool-call-end',
            toolCall: {
              id: entry.id,
              name: entry.name,
              arguments: parseToolArguments(entry.argumentsText)
            }
          });
        }
        return events;
      }

      if (type === 'message_delta') {
        const delta = data['delta'];
        if (delta && typeof delta === 'object') {
          const reason = (delta as { stop_reason?: unknown }).stop_reason;
          if (typeof reason === 'string') finishReason = reason;
        }
        const usage = data['usage'];
        if (usage && typeof usage === 'object') {
          outputTokens = Number(
            (usage as { output_tokens?: unknown }).output_tokens ?? outputTokens
          );
        }
        return events;
      }

      if (type === 'message_stop') {
        done = true;
        events.push({
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens,
            ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
            ...(cacheReadTokens ? { cacheReadTokens } : {})
          } satisfies UsageSummary
        });
        events.push({
          type: 'finish',
          reason: finishReason === 'tool_use' ? 'tool_calls' : finishReason
        });
        return events;
      }

      if (type === 'error') {
        const error = data['error'];
        events.push({
          type: 'error',
          code: 'PROVIDER_ANTHROPIC_ERROR',
          message:
            error && typeof error === 'object' && 'message' in error
              ? String((error as { message: unknown }).message)
              : 'Anthropic 返回错误'
        });
        done = true;
      }

      return events;
    };

    try {
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          for (const event of processData(line.slice(5).trim())) yield event;
          if (done) break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * 测试与构造辅助：解析 Anthropic 工具参数。
 */
export const parseAnthropicToolCall = (
  id: string,
  name: string,
  argumentsText: string
): ProviderToolCall => ({
  id,
  name,
  arguments: parseToolArguments(argumentsText)
});
