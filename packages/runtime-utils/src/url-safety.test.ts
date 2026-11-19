/**
 * 网络地址安全测试：仅允许公网 http/https 地址。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { assertPublicUrl } from './url-safety';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34' }])
}));

const lookupMock = vi.mocked(lookup);

afterEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34' }] as never);
});

describe('assertPublicUrl', () => {
  it('allows public http(s) addresses', async () => {
    await expect(assertPublicUrl('https://example.com/resource')).resolves.toBeInstanceOf(URL);
  });

  it('rejects private network addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.1.10' }] as never);
    await expect(assertPublicUrl('https://internal.example.com')).rejects.toThrow(
      '禁止访问私网地址'
    );
  });

  it('rejects non-http protocols', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow('只支持 http/https URL');
  });
});
