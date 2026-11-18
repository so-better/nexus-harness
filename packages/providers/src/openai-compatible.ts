/**
 * OpenAI 兼容 Provider：用 fetch 解析 SSE，归一化为统一流式事件。
 */

import type { UsageSummary } from '@nexus/shared';
import type {
  ChatMessage,
  ChatProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderToolCall,
  ToolSchema
} from './types';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  capabilities?: Partial<ProviderCapabilities>;
  fetchImpl?: typeof fetch;
}

interface StreamingToolCall {
  id: string;
  name: string;
  argumentsText: string;
  started: boolean;
}

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  toolCalling: true,
  vision: true,
  reasoning: true
};

/**
 * 把内部消息转换为 OpenAI chat/completions 消息。
 */
const toOpenAIMessage = (message: ChatMessage): Record<string, unknown> => {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content
    };
  }

  if (message.images?.length) {
    return {
      role: message.role,
      content: [
        ...(message.content ? [{ type: 'text', text: message.content }] : []),
        ...message.images.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.data}` }
        }))
      ]
    };
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {})
        }
      }))
    };
  }

  return { role: message.role, content: message.content };
};

/**
 * 把内部工具 schema 转换为 OpenAI function 工具。
 */
const toOpenAITool = (tool: ToolSchema): Record<string, unknown> => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }
});

/**
 * 尽力解析流式工具参数；失败时保留原始文本。
 */
const parseArguments = (text: string): unknown => {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * 从流式 delta 中提取文本，兼容字符串与文本片段数组。
 */
const extractText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';

  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .join('');
};

/**
 * OpenAI 兼容流式聊天实现；只依赖标准 fetch。
 */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly capabilities: ProviderCapabilities;

  private readonly config: OpenAICompatibleConfig;

  constructor(config: OpenAICompatibleConfig) {
    this.config = config;
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...config.capabilities };
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.config.headers
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toOpenAIMessage),
        ...(request.tools?.length ? { tools: request.tools.map(toOpenAITool) } : {}),
        stream: true,
        stream_options: { include_usage: true },
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
        ...request.extraParams
      }),
      ...(request.signal ? { signal: request.signal } : {})
    });

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
    const toolCalls = new Map<number, StreamingToolCall>();
    let buffer = '';
    let finishReason = 'stop';
    let done = false;

    /**
     * 处理单行 SSE，返回需要下发的事件并更新工具调用状态。
     */
    const processLine = (rawLine: string): ProviderStreamEvent[] => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return [];

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        done = true;
        return [];
      }

      let data: unknown;
      try {
        data = JSON.parse(payload);
      } catch {
        return [];
      }

      const chunk = data as {
        choices?: Array<{
          delta?: {
            content?: unknown;
            reasoning_content?: unknown;
            reasoning?: unknown;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: Record<string, unknown>;
      };
      const events: ProviderStreamEvent[] = [];

      if (chunk.usage) {
        const usage: UsageSummary = {
          inputTokens: Number(chunk.usage['prompt_tokens'] ?? 0),
          outputTokens: Number(chunk.usage['completion_tokens'] ?? 0),
          ...(typeof chunk.usage['cost'] === 'number' ? { cost: chunk.usage['cost'] } : {})
        };
        events.push({ type: 'usage', usage });
      }

      const choice = chunk.choices?.[0];
      if (!choice) return events;

      const delta = choice.delta ?? {};
      const text = extractText(delta.content);
      if (text) events.push({ type: 'text-delta', text });

      const reasoning = delta.reasoning_content ?? delta.reasoning;
      if (typeof reasoning === 'string' && reasoning) {
        events.push({ type: 'reasoning-delta', text: reasoning });
      }

      for (const part of delta.tool_calls ?? []) {
        const index = part.index ?? 0;
        let entry = toolCalls.get(index);
        if (!entry) {
          entry = {
            id: part.id ?? `call_${index}`,
            name: part.function?.name ?? '',
            argumentsText: '',
            started: false
          };
          toolCalls.set(index, entry);
        }

        if (part.id) entry.id = part.id;
        if (part.function?.name) entry.name = part.function.name;

        if (!entry.started && entry.name) {
          entry.started = true;
          events.push({ type: 'tool-call-start', id: entry.id, name: entry.name });
        }

        if (part.function?.arguments) {
          entry.argumentsText += part.function.arguments;
          events.push({
            type: 'tool-call-delta',
            id: entry.id,
            argumentsDelta: part.function.arguments
          });
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
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
          for (const event of processLine(rawLine)) yield event;
          if (done) break;
        }
      }

      buffer += decoder.decode();

      // 处理没有以换行结束的最后一行
      if (!done && buffer.trim()) {
        for (const event of processLine(buffer)) yield event;
      }
    } finally {
      reader.releaseLock();
    }

    for (const entry of toolCalls.values()) {
      const toolCall: ProviderToolCall = {
        id: entry.id,
        name: entry.name,
        arguments: parseArguments(entry.argumentsText)
      };
      yield { type: 'tool-call-end', toolCall };
    }

    yield { type: 'finish', reason: finishReason };
  }
}
