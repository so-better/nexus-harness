/**
 * 受控下载：SSRF 校验调用、大小上限与流式落盘。
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nexus/runtime-utils', () => ({
  assertPublicUrl: async (raw: string) => new URL(raw)
}));

import { downloadToFile } from './download';

describe('downloadToFile', () => {
  let directory = '';
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-download-'));
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  });

  it('streams the response body to disk', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('hello world', { status: 200 })
    ) as unknown as typeof fetch;

    const destination = join(directory, 'out.bin');
    const result = await downloadToFile('https://example.com/file', destination);

    expect(result.bytes).toBe(11);
    await expect(readFile(destination, 'utf8')).resolves.toBe('hello world');
  });

  it('rejects responses larger than the declared content-length limit', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('payload', {
          status: 200,
          headers: { 'content-length': String(10 * 1024 * 1024) }
        })
    ) as unknown as typeof fetch;

    await expect(
      downloadToFile('https://example.com/file', join(directory, 'big.bin'), { maxBytes: 1024 })
    ).rejects.toThrow(/大小上限/);
  });

  it('follows a redirect and revalidates the target', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      if (String(url) === 'https://example.com/start') {
        return new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/x' } });
      }
      return new Response('data', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await downloadToFile('https://example.com/start', join(directory, 'r.bin'));

    expect(result.finalUrl).toBe('https://cdn.example.com/x');
    expect(calls).toEqual(['https://example.com/start', 'https://cdn.example.com/x']);
  });
});
