/**
 * Ollama Provider：复用 OpenAI 兼容协议，默认无需 API Key。
 */

import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openai-compatible';
import type { ProviderCapabilities } from './types';

export interface OllamaConfig extends Omit<OpenAICompatibleConfig, 'apiKey'> {
  apiKey?: string;
  capabilities?: Partial<ProviderCapabilities>;
}

/**
 * Ollama 通过 /v1/chat/completions 暴露 OpenAI 兼容接口。
 */
export const normalizeOllamaBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

/**
 * Ollama 通过 /v1/chat/completions 暴露 OpenAI 兼容接口。
 */
export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(config: OllamaConfig) {
    super({
      ...config,
      baseUrl: normalizeOllamaBaseUrl(config.baseUrl),
      apiKey: config.apiKey || 'ollama'
    });
  }
}
