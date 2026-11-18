/**
 * 可编排的 Mock Provider：用于 Agent 循环与工具调用测试。
 */

import type { UsageSummary } from '@nexus/shared';
import type {
  ChatProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
  ProviderToolCall
} from './types';

export interface MockTurn {
  text?: string;
  reasoning?: string;
  toolCalls?: ProviderToolCall[];
  usage?: UsageSummary;
  finishReason?: string;
  error?: { code: string; message: string };
}

const MOCK_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  toolCalling: true,
  vision: false,
  reasoning: true
};

/**
 * 按顺序返回预设轮次；用于测试，不访问网络。
 */
export class MockProvider implements ChatProvider {
  readonly capabilities = MOCK_CAPABILITIES;

  private index = 0;

  constructor(private readonly turns: MockTurn[] = []) {}

  async *stream(_request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    const turn = this.turns[this.index] ?? { text: '', finishReason: 'stop' };
    this.index += 1;

    if (turn.reasoning) {
      yield { type: 'reasoning-delta', text: turn.reasoning };
    }

    if (turn.text) {
      yield { type: 'text-delta', text: turn.text };
    }

    for (const toolCall of turn.toolCalls ?? []) {
      yield { type: 'tool-call-start', id: toolCall.id, name: toolCall.name };
      yield {
        type: 'tool-call-delta',
        id: toolCall.id,
        argumentsDelta: JSON.stringify(toolCall.arguments ?? {})
      };
      yield { type: 'tool-call-end', toolCall };
    }

    if (turn.usage) {
      yield { type: 'usage', usage: turn.usage };
    }

    if (turn.error) {
      yield { type: 'error', code: turn.error.code, message: turn.error.message };
      return;
    }

    yield { type: 'finish', reason: turn.finishReason ?? 'stop' };
  }
}
