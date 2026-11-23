/**
 * Provider 额外请求参数校验：阻止覆盖核心协议字段与写入敏感值。
 */

/**
 * 按协议返回默认请求参数；不同协议不混用厂商字段。
 */
export const defaultProviderExtraParams = (
  protocol: string
): Record<string, unknown> | undefined => {
  if (protocol === 'openai') {
    return { thinking: { type: 'enabled' } };
  }
  return undefined;
};

const RESERVED_PARAMS = new Set([
  'model',
  'messages',
  'stream',
  'stream_options',
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'max_tokens',
  'max_completion_tokens'
]);

const SENSITIVE_KEY = /authorization|api[-_]?key|access[-_]?token|secret|password|passwd|cookie/i;

/**
 * 返回被禁止的保留字段。
 */
export const findReservedProviderParams = (params: Record<string, unknown>): string[] =>
  Object.keys(params).filter((key) => RESERVED_PARAMS.has(key));

/**
 * 返回看起来像密钥/凭据的字段名。
 */
export const findSensitiveProviderParams = (params: Record<string, unknown>): string[] =>
  Object.keys(params).filter((key) => SENSITIVE_KEY.test(key));

/**
 * 过滤保留字段；用于手动编辑 providers.json 等绕过 UI 的情况。
 */
export const sanitizeProviderParams = (
  params: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!params) return undefined;
  const entries = Object.entries(params).filter(
    ([key]) => !RESERVED_PARAMS.has(key) && !SENSITIVE_KEY.test(key)
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
};
