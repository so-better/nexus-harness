/**
 * 图像生成模板执行器：请求、结果解析与异步轮询全部由配置决定。
 */

import { randomUUID } from 'node:crypto';
import type { ImageTemplate } from '@nexus/shared';

export interface ImageGenerationRequest {
  template: ImageTemplate;
  apiKey?: string;
  model: string;
  prompt: string;
  count: number;
  size?: string;
  images?: string[];
}

export interface GeneratedImage {
  mime: string;
  buffer: Buffer;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;
const MIN_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 30_000;
const MAX_POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 可选占位符缺失标记：用于移除整个数组项，而不是留下空的 image_url 对象。
 */
const OPTIONAL_MISSING = Symbol('optional-missing');

/**
 * 渲染模板：完整占位符保留原值，缺失值会从对象/数组中移除。
 * `{{?key}}` 表示可选字段；缺失时在数组项中移除整个对象。
 */
const renderTemplate = (
  node: unknown,
  variables: Record<string, unknown>,
  inArray = false
): unknown => {
  if (typeof node === 'string') {
    const optional = /^\{\{\s*\?\s*(\w+)\s*\}\}$/.exec(node);
    if (optional) {
      const value = variables[optional[1] ?? ''];
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        return OPTIONAL_MISSING;
      }
      return value;
    }
    const exact = /^\{\{\s*(\w+)\s*\}\}$/.exec(node);
    if (exact) return variables[exact[1] ?? ''];
    return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }
  if (Array.isArray(node)) {
    return node
      .map((item) => renderTemplate(item, variables, true))
      .filter((item) => item !== undefined && item !== OPTIONAL_MISSING);
  }
  if (node && typeof node === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const rendered = renderTemplate(value, variables, inArray);
      if (rendered === OPTIONAL_MISSING) {
        if (inArray) return OPTIONAL_MISSING;
        continue;
      }
      if (rendered === undefined) continue;
      if (Array.isArray(rendered) && rendered.length === 0) continue;
      if (
        rendered &&
        typeof rendered === 'object' &&
        !Array.isArray(rendered) &&
        Object.keys(rendered).length === 0
      ) {
        continue;
      }
      result[key] = rendered;
    }
    return Object.keys(result).length ? result : undefined;
  }
  return node;
};

/**
 * 按点号路径取值，支持数组下标与 * 通配符。
 */
const getByPath = (data: unknown, path: string): unknown => {
  if (!path) return undefined;
  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  const walk = (node: unknown, index: number): unknown => {
    if (index >= keys.length) return node;
    if (node === undefined || node === null) return undefined;
    const key = keys[index];
    if (key === '*') {
      const values = Array.isArray(node)
        ? node
        : typeof node === 'object'
          ? Object.values(node as Record<string, unknown>)
          : [];
      for (const value of values) {
        const found = walk(value, index + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (Array.isArray(node) && key && /^\d+$/.test(key)) return walk(node[Number(key)], index + 1);
    if (typeof node === 'object')
      return walk((node as Record<string, unknown>)[key ?? ''], index + 1);
    return undefined;
  };
  return walk(data, 0);
};

const firstPathValue = (payload: unknown, paths: string[]): string => {
  for (const path of paths) {
    const value = getByPath(payload, path);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const parseSse = (text: string): unknown[] => {
  const payloads: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const value = trimmed.slice(5).trim();
    if (!value || value === '[DONE]') continue;
    try {
      payloads.push(JSON.parse(value));
    } catch {
      // 忽略无法解析的 data 行
    }
  }
  return payloads;
};

const readLimited = async (response: Response, limit: number, label: string): Promise<Buffer> => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > limit) throw new Error(`${label}超过大小上限`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error(`${label}超过大小上限`);
  return bytes;
};

const headersFor = (template: ImageTemplate, apiKey?: string): Record<string, string> => {
  const variables = { api_key: apiKey };
  const renderHeader = (value: string): string => {
    const rendered = renderTemplate(value, variables);
    return rendered === undefined || rendered === null ? '' : String(rendered);
  };
  const headers = Object.fromEntries(
    Object.entries(template.headers ?? {}).map(([key, value]) => [key, renderHeader(value)])
  );
  const has = (name: string): boolean =>
    Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
  if (apiKey && !has('authorization')) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
};

const request = async (url: string, init: RequestInit, label: string): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'TimeoutError' ? `${label}超时` : `${label}请求失败`;
    throw new Error(message, { cause: error });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `${label}返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 500)}` : ''}`
    );
  }
  return response;
};

const isBase64Like = (value: string): boolean =>
  value.length >= 64 && /^[A-Za-z0-9+/=\s]+$/.test(value);

/**
 * 把 URL、Base64 或 data URI 转成图片字节。
 */
const loadImage = async (
  value: string,
  encoding: string,
  baseUrl: string
): Promise<GeneratedImage> => {
  const mode = encoding === 'auto' ? '' : encoding;
  if (mode === 'base64') {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    const buffer = Buffer.from(match?.[2] ?? value.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('图像超过大小上限');
    return { mime: match?.[1] ?? 'image/png', buffer };
  }
  if (mode !== 'url' && mode !== 'binary' && isBase64Like(value)) {
    return loadImage(value, 'base64', baseUrl);
  }

  let target = value;
  if (target.startsWith('data:')) return loadImage(target, 'base64', baseUrl);
  if (target.startsWith('//')) target = `https:${target}`;
  if (!/^https?:\/\//i.test(target)) target = new URL(target, baseUrl).toString();
  const response = await request(target, { method: 'GET' }, '下载图像');
  const buffer = await readLimited(response, MAX_IMAGE_BYTES, '图像');
  return {
    mime: response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png',
    buffer
  };
};

const resultValue = (payloads: unknown[], template: ImageTemplate, text: string): string => {
  const result = template.result;
  const paths = result?.paths ?? (result?.path ? [result.path] : []);
  for (const path of paths) {
    for (const payload of payloads) {
      const value = getByPath(payload, path);
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  if (result?.regex) {
    const match = new RegExp(result.regex).exec(text);
    if (match) return (match[1] ?? match[0] ?? '').trim();
  }
  if (!paths.length) {
    for (const payload of payloads) {
      if (typeof payload === 'string' && payload.trim()) return payload.trim();
    }
  }
  return '';
};

const pollTask = async (
  template: ImageTemplate,
  taskId: string,
  apiKey: string | undefined
): Promise<GeneratedImage> => {
  const poll = template.poll;
  if (!poll) throw new Error('异步生图配置缺少 poll');
  const success = new Set(
    (poll.success ?? ['succeeded', 'success', 'completed']).map((value) => value.toLowerCase())
  );
  const failed = new Set((poll.failed ?? ['failed', 'error']).map((value) => value.toLowerCase()));
  const interval = Math.min(
    Math.max(Number(poll.interval_ms) || 2_000, MIN_POLL_INTERVAL_MS),
    MAX_POLL_INTERVAL_MS
  );
  const timeout = Math.min(
    Math.max(Number(poll.timeout_ms) || 300_000, interval),
    MAX_POLL_TIMEOUT_MS
  );
  const deadline = Date.now() + timeout;
  const url = poll.path.replace(/\{\{\s*id\s*\}\}/g, encodeURIComponent(taskId));
  const headers = headersFor(template, apiKey);

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(interval, deadline - Date.now())));
    const response = await request(
      url,
      { method: (poll.method ?? 'GET').toUpperCase(), headers },
      '查询生图任务'
    );
    const payload: unknown = await response.json();
    const status = firstPathValue(
      payload,
      poll.status_paths?.length ? poll.status_paths : [poll.status_path]
    ).toLowerCase();
    if (failed.has(status)) throw new Error(`生图任务失败：${status}`);
    if (!success.has(status)) continue;
    const value = firstPathValue(
      payload,
      poll.result_paths?.length ? poll.result_paths : [poll.result_path]
    );
    if (!value) throw new Error('生图任务已完成但未取到图片');
    const encoding =
      template.result?.encoding === 'binary' ? 'auto' : (template.result?.encoding ?? 'auto');
    return loadImage(value, encoding, template.url);
  }
  throw new Error('生图任务超时');
};

/**
 * 按模板生成图片；每次请求生成一张，count 控制请求次数。
 */
export const generateImages = async (
  requestInput: ImageGenerationRequest
): Promise<GeneratedImage[]> => {
  const template = requestInput.template;
  const variables: Record<string, unknown> = {
    model: requestInput.model,
    prompt: requestInput.prompt,
    size: requestInput.size,
    image_url: requestInput.images?.[0],
    image_urls: requestInput.images?.length ? requestInput.images : undefined,
    count: 1,
    session: randomUUID(),
    api_key: requestInput.apiKey
  };
  const headers = headersFor(template, requestInput.apiKey);
  const body = template.body === undefined ? undefined : renderTemplate(template.body, variables);
  if (
    body !== undefined &&
    !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const images: GeneratedImage[] = [];
  for (let index = 0; index < requestInput.count; index += 1) {
    const response = await request(
      template.url,
      {
        method: (template.method ?? 'POST').toUpperCase(),
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      },
      '生图服务'
    );

    if (template.poll) {
      const payload = (await response.json()) as unknown;
      const taskId = firstPathValue(
        payload,
        template.poll.id_paths?.length ? template.poll.id_paths : [template.poll.id_path]
      );
      if (!taskId) throw new Error('未能从生图提交结果中解析出任务 ID');
      images.push(await pollTask(template, taskId, requestInput.apiKey));
      continue;
    }

    const encoding = template.result?.encoding ?? 'auto';
    if (encoding === 'binary') {
      images.push({
        mime: response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png',
        buffer: await readLimited(response, MAX_IMAGE_BYTES, '图像')
      });
      continue;
    }

    const text = (await readLimited(response, MAX_TEXT_BYTES, '生图响应')).toString('utf8');
    const format =
      template.result?.format ??
      (/event-stream/.test(response.headers.get('content-type') ?? '') ? 'sse' : 'json');
    const payloads: unknown[] = [];
    if (format === 'sse') payloads.push(...parseSse(text));
    else {
      try {
        payloads.push(JSON.parse(text));
      } catch {
        // 非 JSON 由正则或原文本兜底
      }
    }
    const value = resultValue(payloads, template, text);
    if (!value) throw new Error(`未能从生图响应中解析出图片：${text.slice(0, 500)}`);
    images.push(await loadImage(value, encoding, template.url));
  }
  return images;
};
