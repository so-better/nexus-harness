/**
 * 受控文件下载：SSRF 校验、重定向限制、大小与超时上限，流式写入磁盘。
 * 供 Python 运行时等需要从未知远端拉取二进制的场景复用。
 */

import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertPublicUrl } from '@nexus/runtime-utils';

const DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_REDIRECTS = 5;

export interface DownloadOptions {
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** 已写入字节与总字节（无 content-length 时 total 为 undefined）；节流后回调 */
  onProgress?: (written: number, total?: number) => void;
}

export interface DownloadResult {
  bytes: number;
  finalUrl: string;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * 下载远端文件到本地路径；超限或失败会清理半成品文件。
 * 每一跳都重新做 SSRF 校验，禁止私网、回环与云元数据地址。
 */
export const downloadToFile = async (
  rawUrl: string,
  destination: string,
  options: DownloadOptions = {}
): Promise<DownloadResult> => {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentUrl = rawUrl;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        ...(options.headers ? { headers: options.headers } : {})
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }

    if (REDIRECT_STATUS.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('下载失败：重定向缺少 Location');
      currentUrl = new URL(location, url).toString();
      continue;
    }
    break;
  }

  if (!response) throw new Error('下载失败：重定向次数过多');
  if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('下载失败：文件超过大小上限');
  }

  let bytes = 0;
  const total = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : undefined;
  // 节流进度回调，避免每个分片都触发事件
  let lastProgressAt = 0;
  const nodeStream = Readable.fromWeb(response.body);
  // 边写边计数，防止缺少或伪造 content-length 的超大响应
  nodeStream.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) nodeStream.destroy(new Error('下载失败：文件超过大小上限'));
    if (options.onProgress) {
      const now = Date.now();
      if (now - lastProgressAt >= 400) {
        lastProgressAt = now;
        options.onProgress(bytes, total);
      }
    }
  });

  try {
    await pipeline(nodeStream, createWriteStream(destination));
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  return { bytes, finalUrl: currentUrl };
};
