/**
 * AnySearch HTTP 客户端：统一处理认证、超时、错误与重试提示。
 */

const BASE_URL = 'https://api.anysearch.com';
const TIMEOUT_MS = 30_000;

interface AnySearchEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
  retry_after_seconds?: number;
}

const retryAfterSeconds = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
};

/**
 * 调用 AnySearch JSON API；有 Key 时附加 Bearer，无 Key 走匿名访问。
 */
export const requestAnySearch = async <T>(
  path: string,
  body: Record<string, unknown>,
  apiKey?: string
): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  let payload: AnySearchEnvelope<T>;
  try {
    payload = JSON.parse(text) as AnySearchEnvelope<T>;
  } catch {
    throw new Error(`AnySearch 返回非 JSON 响应：HTTP ${response.status}`);
  }
  if (!response.ok) {
    const retry =
      retryAfterSeconds(response.headers.get('retry-after')) ?? payload.retry_after_seconds;
    const suffix = retry === undefined ? '' : `，请在 ${retry} 秒后重试`;
    const detail = payload.message ? `：${payload.message.slice(0, 200)}` : '';
    throw new Error(`AnySearch 请求失败：HTTP ${response.status}${suffix}${detail}`);
  }
  if (payload.code !== 0) {
    throw new Error(`AnySearch 请求失败：${payload.message ?? '未知错误'}`);
  }
  return (payload.data ?? {}) as T;
};
