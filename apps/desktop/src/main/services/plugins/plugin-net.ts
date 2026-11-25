/**
 * 插件受控网络：按 manifest 域名白名单与 SSRF 校验代理 HTTP 请求。
 * 只返回文本、限制响应大小与超时，不跟随重定向（避免跳转到非白名单/私网）。
 */
import { assertPublicUrl } from '@nexus/runtime-utils';
import type { PluginNetRequestInit, PluginNetResponse, PluginPublic } from '@shared/plugin';

const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * 判断主机是否命中白名单；支持精确主机与 `*.example.com` 子域通配。
 */
export const isHostAllowed = (hostname: string, hosts: readonly string[]): boolean => {
  const host = hostname.toLowerCase();
  return hosts.some((pattern) => {
    const value = pattern.trim().toLowerCase();
    if (!value) return false;
    if (value.startsWith('*.')) {
      const suffix = value.slice(1); // ".example.com"
      return host.endsWith(suffix);
    }
    return host === value;
  });
};

/**
 * 读取响应体，超过上限时中断并报错。
 */
const readCappedText = async (response: Response): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('响应超过大小上限');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

/**
 * 执行一次受控网络请求。
 */
export const pluginNetworkFetch = async (
  plugin: PluginPublic | undefined,
  input: { url: string } & PluginNetRequestInit
): Promise<PluginNetResponse> => {
  if (!plugin) throw new Error('插件不存在');
  if (!plugin.enabled) throw new Error('插件未启用');
  if (!plugin.permissions.includes('network')) throw new Error('缺少 network 权限');

  const hosts = plugin.network?.hosts ?? [];
  if (hosts.length === 0) throw new Error('未声明网络白名单（manifest.network.hosts）');

  const target = new URL(input.url);
  if (!isHostAllowed(target.hostname, hosts)) throw new Error(`域名不在白名单：${target.hostname}`);

  // DNS 解析后拒绝私网/回环/云元数据地址
  const safeUrl = await assertPublicUrl(input.url);

  const method = input.method ?? 'GET';
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(1_000, input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(safeUrl, {
      method,
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.body !== undefined && method !== 'GET' && method !== 'HEAD'
        ? { body: input.body }
        : {}),
      redirect: 'manual',
      signal: controller.signal
    });
    const text = await readCappedText(response);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { ok: response.ok, status: response.status, headers, text };
  } finally {
    clearTimeout(timer);
  }
};
