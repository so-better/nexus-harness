/**
 * Provider 探测：通过 /models 接口验证连接并获取可用模型。
 */

import { isDeepSeekBaseUrl } from '@nexus/shared';

const PROBE_TIMEOUT_MS = 15_000;

/**
 * 探测所需的最小 Provider 配置。
 */
export interface ProviderProbeConfig {
  protocol?: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

/**
 * Provider 探测结果；latencyMs 为请求耗时。
 */
export interface ProviderProbeResult {
  models: string[];
  latencyMs: number;
}

/**
 * 探测失败原因；code 供 IPC 层映射为结构化错误。
 */
export class ProviderProbeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ProviderProbeError';
  }
}

/**
 * 返回带默认值的错误信息；避免把 API Key 写入日志或错误。
 */
const errorForStatus = (status: number): ProviderProbeError => {
  if (status === 401 || status === 403) {
    return new ProviderProbeError('PROVIDER_UNAUTHORIZED', '认证失败，请检查 API Key');
  }
  if (status === 404 || status === 405) {
    return new ProviderProbeError(
      'PROVIDER_MODELS_UNSUPPORTED',
      '该服务不支持 /models 接口，无法自动获取模型'
    );
  }
  if (status === 429) {
    return new ProviderProbeError('PROVIDER_RATE_LIMITED', '请求过于频繁，请稍后重试');
  }
  return new ProviderProbeError(`PROVIDER_HTTP_${status}`, `模型服务返回 HTTP ${status}`);
};

/**
 * 请求 /models；成功返回去重后的模型列表。
 */
export const probeProvider = async (config: ProviderProbeConfig): Promise<ProviderProbeResult> => {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const isAnthropic = config.protocol === 'anthropic';
  const modelsUrl = isAnthropic
    ? `${baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`}/models`
    : `${baseUrl}/models`;
  // DeepSeek 的 Anthropic 端点不支持 /models，回退到同源的 OpenAI 兼容 /models
  const fallbackModelsUrl =
    isAnthropic && isDeepSeekBaseUrl(baseUrl)
      ? `${baseUrl.replace(/\/anthropic(?:\/v1)?\/?$/i, '')}/models`
      : undefined;
  const startedAt = Date.now();
  const authHeaders = isAnthropic
    ? {
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': '2023-06-01'
      }
    : config.apiKey
      ? { Authorization: `Bearer ${config.apiKey}` }
      : {};
  const fallbackHeaders =
    config.apiKey === undefined || config.apiKey === ''
      ? {}
      : { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey };

  const requestModels = (url: string, headers: Record<string, string>): Promise<Response> =>
    fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        ...config.headers
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });

  let response: Response;
  try {
    response = await requestModels(modelsUrl, authHeaders);
    if (!response.ok && fallbackModelsUrl && (response.status === 404 || response.status === 405)) {
      response = await requestModels(fallbackModelsUrl, fallbackHeaders);
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? '连接超时，请检查 Base URL 与网络'
        : '无法连接到模型服务';
    throw new ProviderProbeError('PROVIDER_UNREACHABLE', message);
  }

  if (!response.ok) throw errorForStatus(response.status);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderProbeError('PROVIDER_INVALID_RESPONSE', '模型服务返回了无效 JSON');
  }

  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : undefined;
  const models = Array.isArray(data)
    ? [
        ...new Set(
          data
            .map((item) =>
              item && typeof item === 'object' && 'id' in item
                ? (item as { id?: unknown }).id
                : undefined
            )
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      ].sort((a, b) => a.localeCompare(b))
    : [];

  return { models, latencyMs: Date.now() - startedAt };
};
