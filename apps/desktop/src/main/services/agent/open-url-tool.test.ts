// @vitest-environment node
/**
 * open_url：只放行 http/https，并通过注入的浏览器打开能力验证调用。
 */
import { describe, expect, it, vi } from 'vitest';
import { executeOpenUrlTool, openUrlToolDefinition } from './open-url-tool';

describe('open_url', () => {
  it('requires approval and uses the network permission', () => {
    expect(openUrlToolDefinition).toMatchObject({
      name: 'open_url',
      permission: 'network',
      requiresApproval: true
    });
  });

  it('opens a normalized http(s) URL in the system browser', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);

    const result = await executeOpenUrlTool({ url: 'https://www.baidu.com' }, { openExternal });

    expect(result.ok).toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://www.baidu.com/');
    expect(JSON.parse(result.output)).toMatchObject({ opened: true });
  });

  it('rejects invalid or non-web URLs', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);

    for (const input of [
      {},
      { url: '' },
      { url: 'file:///etc/passwd' },
      { url: 'javascript:alert(1)' },
      { url: 'not-a-url' },
      { url: 'https://example.com', extra: true }
    ]) {
      const result = await executeOpenUrlTool(input, { openExternal });
      expect(result).toMatchObject({ ok: false, error: { code: 'OPEN_URL_INVALID_INPUT' } });
    }
    expect(openExternal).not.toHaveBeenCalled();
  });
});
