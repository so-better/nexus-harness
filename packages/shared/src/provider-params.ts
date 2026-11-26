/**
 * Provider 参数校验与 DeepSeek 识别。
 * 模型 JSON 除保留键外原样透传给模型，宿主不解析思考等具体字段。
 */

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
 * 思考内容字段不能覆盖的消息结构保留字段。
 */
const RESERVED_MESSAGE_FIELDS = new Set([
  'role',
  'content',
  'tool_calls',
  'tool_call_id',
  'name',
  'function_call'
]);

const REASONING_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * 校验思考内容字段名：空表示使用默认；必须是合法标识符且不能覆盖消息保留字段。
 */
export const isValidReasoningField = (field: string | undefined): boolean => {
  const trimmed = field?.trim() ?? '';
  if (!trimmed) return true;
  return REASONING_FIELD_PATTERN.test(trimmed) && !RESERVED_MESSAGE_FIELDS.has(trimmed);
};

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
 * 判断 Base URL 是否指向 DeepSeek。
 * 目前用于 provider-probe 在 DeepSeek Anthropic 端点下回退到 OpenAI /models。
 */
export const isDeepSeekBaseUrl = (baseUrl: string): boolean => {
  const trimmed = baseUrl.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(withScheme);
  if (!match?.[1]) return false;
  const host = match[1].toLowerCase().replace(/:\d+$/, '');
  return host === 'deepseek.com' || host.endsWith('.deepseek.com');
};

/**
 * 过滤保留字段与敏感字段；用于手动编辑 providers.json 等绕过 UI 的情况。
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
