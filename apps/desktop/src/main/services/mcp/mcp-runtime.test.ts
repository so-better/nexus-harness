/**
 * MCP 运行时辅助测试：缓存未命中识别与错误脱敏。
 */
import { describe, expect, it } from 'vitest';
import { isUvCacheMiss, sanitizeMcpError } from './mcp-runtime';

describe('mcp runtime helpers', () => {
  it('recognizes uv cache misses but not generic failures', () => {
    expect(isUvCacheMiss('error: No solution found when resolving tool dependencies')).toBe(true);
    expect(isUvCacheMiss('Because demo was not found in the cache')).toBe(true);
    expect(isUvCacheMiss('spawn uvx ENOENT')).toBe(false);
    expect(isUvCacheMiss('MCP demo 连接超时')).toBe(false);
  });

  it('redacts credentials and truncates long errors', () => {
    const value = sanitizeMcpError(
      'https://user:pass@example.com?token=secret Bearer abc sk-1234567890abcdef ' +
        'x'.repeat(2_100)
    );
    expect(value).not.toContain('pass');
    expect(value).not.toContain('secret');
    expect(value).not.toContain('abc');
    expect(value).not.toContain('sk-1234567890abcdef');
    expect(value.length).toBe(2_000);
  });
});
