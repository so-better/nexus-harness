/**
 * MCP 运行时辅助：判断 uv 缓存未命中，并脱敏启动错误中的敏感信息。
 */

// 用字符串构造 ANSI 正则，避免 ESLint 的 no-control-regex 误报
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const UV_CACHE_MISS_PATTERNS = [
  /No solution found when resolving tool dependencies/i,
  /was not found in the cache/i,
  /network was disabled.*registry packages may only be read from the cache/i
];

/**
 * 判断 uvx 错误是否只是缓存未命中；只有这种情况才值得继续尝试下一级缓存或联网。
 */
export const isUvCacheMiss = (message: string): boolean =>
  UV_CACHE_MISS_PATTERNS.some((pattern) => pattern.test(message));

/**
 * 脱敏 MCP 启动错误，并限制持久化长度。
 */
export const sanitizeMcpError = (value: string, maxLength = 2_000): string => {
  const sanitized = value
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(/(https?:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, '$1$2:***@')
    .replace(
      /([?&][^=&\s]*(?:token|api[_-]?key|access[_-]?token|auth|password|secret)[^=&\s]*=)[^&\s]+/gi,
      '$1***'
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '***');
  return sanitized.length > maxLength ? sanitized.slice(-maxLength) : sanitized;
};
