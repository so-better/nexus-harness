/**
 * MCP 工具接入：扫描 userData/mcp，按需连接 stdio/http Server 并统一命名工具。
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  mcpServerConfigSchema,
  type McpConfig,
  type McpServerConfig,
  type McpServerStatus
} from '@shared/mcp';
import type { AgentToolDefinition } from '@nexus/core';
import { assertPublicUrl } from '@nexus/runtime-utils';
import { getAppDataPaths, getMcpWorkdirPath } from '../storage/paths';
import { isUvCacheMiss, sanitizeMcpError } from './mcp-runtime';

/**
 * 把 MCP 工具名转换为模型接口允许的 `[a-zA-Z0-9_-]`，并按需截断加哈希。
 */
export const mcpToolAlias = (serverId: string, toolName: string): string => {
  const sanitize = (value: string): string =>
    value
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'tool';
  const base = `mcp_${sanitize(serverId)}_${sanitize(toolName)}`;
  if (base.length <= 64) return base;
  const hash = createHash('sha1').update(`${serverId}\0${toolName}`).digest('hex').slice(0, 8);
  return `${base.slice(0, 55)}_${hash}`;
};

interface ConnectedServer {
  config: McpConfig;
  client: Client;
  tools: Array<{ name: string; description?: string; inputSchema: unknown }>;
  resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string }>;
  prompts: Array<{ name: string; description?: string }>;
}

export interface McpAttachment {
  name: string;
  mime: string;
  data: Uint8Array;
}

const normalizeResourceResult = (
  result: unknown
): { text: string; attachments: McpAttachment[] } => {
  if (!result || typeof result !== 'object' || !('contents' in result)) {
    return { text: '', attachments: [] };
  }
  const contents = (result as { contents?: unknown }).contents;
  if (!Array.isArray(contents)) return { text: '', attachments: [] };
  const text: string[] = [];
  const attachments: McpAttachment[] = [];
  for (const [index, item] of contents.entries()) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { uri?: unknown; text?: unknown; blob?: unknown; mimeType?: unknown };
    if (typeof record.text === 'string') text.push(record.text);
    else if (typeof record.blob === 'string') {
      attachments.push({
        name: `mcp-resource-${index + 1}`,
        mime: typeof record.mimeType === 'string' ? record.mimeType : 'application/octet-stream',
        data: Buffer.from(record.blob, 'base64')
      });
    } else if (typeof record.uri === 'string') text.push(record.uri);
  }
  return { text: text.join('\n'), attachments };
};

const toConfig = (id: string, server: McpServerConfig): McpConfig => ({
  ...server,
  id,
  name: id,
  transport: server.type ?? (server.command ? 'stdio' : 'http')
});

const CONNECT_TIMEOUT_MS = 10_000;
const UVX_INSTALL_TIMEOUT_MS = 180_000;
const CALL_TIMEOUT_MS = 60_000;
const CONNECT_CONCURRENCY = 3;
const CONNECT_RETRY_COOLDOWN_MS = 60_000;

/** 配置指纹；配置变化后允许立即重试，不受失败冷却影响。 */
const configKey = (config: McpConfig): string =>
  JSON.stringify([
    config.transport,
    config.command,
    config.args,
    config.cwd,
    config.startupTimeoutMs,
    config.env,
    config.url,
    config.headers
  ]);

const withTimeout = async <T>(
  promise: Promise<T>,
  message: string,
  timeoutMs = CONNECT_TIMEOUT_MS
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const forEachConcurrent = async <T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
};

const normalizeResult = (result: unknown): { text: string; attachments: McpAttachment[] } => {
  if (!result || typeof result !== 'object' || !('content' in result)) {
    return { text: '', attachments: [] };
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return { text: '', attachments: [] };
  const text: string[] = [];
  const attachments: McpAttachment[] = [];
  for (const [index, item] of content.entries()) {
    if (!item || typeof item !== 'object') continue;
    const record = item as {
      type?: unknown;
      text?: unknown;
      uri?: unknown;
      data?: unknown;
      mimeType?: unknown;
      resource?: { uri?: unknown; text?: unknown; blob?: unknown; mimeType?: unknown };
    };
    if (record.type === 'text' && typeof record.text === 'string') {
      text.push(record.text);
      continue;
    }
    if (record.type === 'resource_link' && typeof record.uri === 'string') {
      text.push(record.uri);
      continue;
    }
    if (
      (record.type === 'image' || record.type === 'audio' || record.type === 'blob') &&
      typeof record.data === 'string' &&
      typeof record.mimeType === 'string'
    ) {
      attachments.push({
        name: `mcp-${record.type}-${index + 1}`,
        mime: record.mimeType,
        data: Buffer.from(record.data, 'base64')
      });
      continue;
    }
    if (record.type === 'resource' && record.resource) {
      if (typeof record.resource.text === 'string') text.push(record.resource.text);
      else if (typeof record.resource.blob === 'string') {
        attachments.push({
          name: `mcp-resource-${index + 1}`,
          mime:
            typeof record.resource.mimeType === 'string'
              ? record.resource.mimeType
              : 'application/octet-stream',
          data: Buffer.from(record.resource.blob, 'base64')
        });
      } else if (typeof record.resource.uri === 'string') text.push(record.resource.uri);
    }
  }
  return { text: text.join('\n'), attachments };
};

export class McpService {
  /** 公共工具名到 MCP 原始工具名的映射；每次列举时重建。 */
  private readonly toolAliases = new Map<string, { serverId: string; toolName: string }>();
  private readonly connected = new Map<string, ConnectedServer>();
  private readonly connectionKeys = new Map<string, string>();
  private readonly lastErrors = new Map<string, string>();
  private readonly preparing = new Set<string>();
  private statusHydrated = false;
  private listToolsPromise: Promise<AgentToolDefinition[]> | undefined;
  private generation = 0;
  private readonly retryAt = new Map<string, { key: string; until: number }>();

  constructor(private readonly baseDir?: string) {}

  private get directory(): string {
    return this.baseDir ?? getAppDataPaths().mcp;
  }

  private async readConfigs(): Promise<McpConfig[]> {
    try {
      const raw = JSON.parse(await readFile(join(this.directory, 'mcp.json'), 'utf8')) as unknown;
      const servers =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as { mcpServers?: unknown }).mcpServers
          : undefined;
      if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return [];
      return Object.entries(servers as Record<string, unknown>).flatMap(([id, value]) => {
        const server = mcpServerConfigSchema.safeParse(value);
        return server.success ? [toConfig(id, server.data)] : [];
      });
    } catch {
      return [];
    }
  }

  /**
   * 从本地 status.json 恢复上次启动失败信息，避免重启后丢失诊断。
   */
  private async hydrateStatus(): Promise<void> {
    if (this.statusHydrated) return;
    this.statusHydrated = true;
    try {
      const raw = JSON.parse(
        await readFile(join(this.directory, 'status.json'), 'utf8')
      ) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      for (const [id, value] of Object.entries(raw)) {
        if (typeof value === 'string') this.lastErrors.set(id, value);
      }
    } catch {
      // 状态文件缺失或损坏时忽略
    }
  }

  private statusWrite: Promise<void> = Promise.resolve();

  /**
   * 串行化状态写入，避免并行连接时多个 Server 竞争同一个 status.json。
   */
  private persistStatus(): Promise<void> {
    const write = this.statusWrite.then(async () => {
      try {
        await mkdir(this.directory, { recursive: true });
        await writeFile(
          join(this.directory, 'status.json'),
          `${JSON.stringify(Object.fromEntries(this.lastErrors), null, 2)}\n`,
          'utf8'
        );
      } catch {
        // 状态持久化失败不影响 MCP 调用
      }
    });
    this.statusWrite = write;
    return write;
  }

  private async clearPersistedStatus(): Promise<void> {
    this.lastErrors.clear();
    await this.persistStatus();
  }

  async listConfigs(): Promise<McpConfig[]> {
    return this.readConfigs();
  }

  /**
   * 返回 Server 的最近连接状态，供扩展页展示启动错误。
   */
  async getStatus(): Promise<McpServerStatus[]> {
    await this.hydrateStatus();
    const configs = await this.readConfigs();
    return configs.map((config) => {
      const error = this.lastErrors.get(config.id);
      return {
        id: config.id,
        enabled: config.enabled !== false,
        connected: this.connected.has(config.id),
        tools: this.connected.get(config.id)?.tools.length ?? 0,
        ...(this.preparing.has(config.id) ? { preparing: true } : {}),
        ...(error ? { error } : {})
      };
    });
  }

  async readRaw(): Promise<string | undefined> {
    try {
      return await readFile(join(this.directory, 'mcp.json'), 'utf8');
    } catch {
      return undefined;
    }
  }

  /**
   * 保存标准 mcp.json；mcpServers 中的 key 即 Server id。
   */
  async saveRaw(rawText: string): Promise<void> {
    const raw = JSON.parse(rawText) as { mcpServers?: unknown };
    if (
      !raw ||
      typeof raw !== 'object' ||
      !raw.mcpServers ||
      typeof raw.mcpServers !== 'object' ||
      Array.isArray(raw.mcpServers)
    ) {
      throw new Error('mcp.json 必须包含 mcpServers 对象');
    }
    for (const [id, value] of Object.entries(raw.mcpServers as Record<string, unknown>)) {
      if (!id || !mcpServerConfigSchema.safeParse(value).success) {
        throw new Error(`MCP Server 配置不合法：${id}`);
      }
    }
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, 'mcp.json'), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    // 连接由文件监听或下一次 listTools 按新配置重建；这里只清理旧失败冷却
    this.retryAt.clear();
    await this.clearPersistedStatus();
  }

  /**
   * 启动 stdio Server；uvx 先走离线缓存，缺失时自动在线准备依赖。
   * 首次安装不能要求用户手动执行命令，因此给 uvx 单独的较长启动窗口。
   */
  private async connectStdio(config: McpConfig): Promise<Client> {
    if (!config.command) throw new Error('缺少 command');
    const defaultWorkdir = getMcpWorkdirPath(this.directory);
    const workdir = config.cwd ? resolve(this.directory, config.cwd) : defaultWorkdir;
    await mkdir(workdir, { recursive: true });

    const env: Record<string, string> = {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      USER: process.env['USER'] ?? '',
      TMPDIR: process.env['TMPDIR'] ?? '',
      SystemRoot: process.env['SystemRoot'] ?? '',
      ...config.env
    };
    const isUvx = /^uvx(?:\.exe)?$/i.test(basename(config.command));
    if (isUvx) {
      const cache = join(this.directory, 'cache', 'uv');
      await mkdir(cache, { recursive: true });
      const customCache = env['UV_CACHE_DIR'];
      const cachedEnv: Record<string, string> = { ...env, UV_CACHE_DIR: customCache ?? cache };
      const failures: string[] = [];

      /**
       * 只在 uv 明确报告缓存未命中时继续下一级；其他错误直接返回，避免重复启动。
       */
      const attempt = async (
        label: string,
        attemptEnv: Record<string, string>,
        timeoutMs: number
      ): Promise<{ client?: Client; error?: string; cacheMiss?: boolean }> => {
        try {
          return { client: await this.openStdio(config, workdir, attemptEnv, timeoutMs) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(`${label}：${message}`);
          return { error: message, cacheMiss: isUvCacheMiss(message) };
        }
      };

      const offline = await attempt(
        '应用缓存',
        { ...cachedEnv, UV_OFFLINE: '1' },
        CONNECT_TIMEOUT_MS
      );
      if (offline.client) return offline.client;
      if (!offline.cacheMiss) throw new Error(offline.error, { cause: offline.error });

      if (!customCache) {
        const userCache = await attempt(
          '本机 uv 缓存',
          { ...env, UV_OFFLINE: '1' },
          CONNECT_TIMEOUT_MS
        );
        if (userCache.client) return userCache.client;
        if (!userCache.cacheMiss) throw new Error(userCache.error, { cause: userCache.error });
      }

      this.preparing.add(config.id);
      try {
        const online = await attempt(
          '在线准备依赖',
          cachedEnv,
          config.startupTimeoutMs ?? UVX_INSTALL_TIMEOUT_MS
        );
        if (online.client) return online.client;
        throw new Error(failures.join('；'));
      } finally {
        this.preparing.delete(config.id);
      }
    }

    return this.openStdio(config, workdir, env, config.startupTimeoutMs ?? CONNECT_TIMEOUT_MS);
  }

  /**
   * 创建一次 stdio 连接；stderr 保留在错误中，便于定位启动失败。
   */
  private async openStdio(
    config: McpConfig,
    workdir: string,
    env: Record<string, string>,
    timeoutMs: number
  ): Promise<Client> {
    const command = config.command;
    if (!command) throw new Error('缺少 command');
    const client = new Client({ name: 'nexus', version: '0.1.0' }, { capabilities: {} });
    let stderr = '';
    const transport = new StdioClientTransport({
      command,
      args: config.args,
      cwd: workdir,
      env,
      stderr: 'pipe'
    });
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 4_000) stderr = stderr.slice(-4_000);
    });
    transport.stderr?.on('error', () => undefined);
    try {
      await withTimeout(client.connect(transport), `MCP ${config.id} 连接超时`, timeoutMs);
      return client;
    } catch (error) {
      await client.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      const detail = sanitizeMcpError(stderr.trim() ? `${message}: ${stderr.trim()}` : message);
      throw new Error(detail, { cause: error });
    }
  }

  private async connect(
    config: McpConfig,
    throwOnError = false
  ): Promise<ConnectedServer | undefined> {
    let client: Client | undefined;
    try {
      if (config.transport === 'http' || config.transport === 'sse') {
        client = new Client({ name: 'nexus', version: '0.1.0' }, { capabilities: {} });
        if (!config.url) throw new Error('缺少 URL');
        const url = await assertPublicUrl(config.url);
        if (config.transport === 'sse') {
          const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
          const transport = new SSEClientTransport(url, {
            requestInit: { headers: config.headers }
          });
          await withTimeout(client.connect(transport), `MCP ${config.id} 连接超时`);
        } else {
          const { StreamableHTTPClientTransport } =
            await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
          const transport = new StreamableHTTPClientTransport(url, {
            requestInit: { headers: config.headers }
          });
          await withTimeout(client.connect(transport), `MCP ${config.id} 连接超时`);
        }
      } else {
        client = await this.connectStdio(config);
      }
      const listTimeout =
        config.startupTimeoutMs ??
        (config.command && /^uvx(?:\.exe)?$/i.test(basename(config.command))
          ? UVX_INSTALL_TIMEOUT_MS
          : CONNECT_TIMEOUT_MS);
      const listed = await withTimeout(
        client.listTools(),
        `MCP ${config.id} 列举工具超时`,
        listTimeout
      );
      this.preparing.delete(config.id);
      this.lastErrors.delete(config.id);
      this.retryAt.delete(config.id);
      await this.persistStatus();
      const tools = (listed.tools ?? []).slice(0, 100).map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : { type: 'object', properties: {} }
      }));
      const resources = await withTimeout(
        client.listResources().then((result) => result.resources ?? []),
        `MCP ${config.id} 列举资源超时`
      ).catch(() => []);
      const prompts = await withTimeout(
        client.listPrompts().then((result) => result.prompts ?? []),
        `MCP ${config.id} 列举提示词超时`
      ).catch(() => []);
      return {
        config,
        client,
        tools,
        resources: resources.slice(0, 100).map((resource) => ({
          uri: resource.uri,
          ...(resource.name ? { name: resource.name } : {}),
          ...(resource.description ? { description: resource.description } : {}),
          ...(resource.mimeType ? { mimeType: resource.mimeType } : {})
        })),
        prompts: prompts.slice(0, 100).map((prompt) => ({
          name: prompt.name,
          ...(prompt.description ? { description: prompt.description } : {})
        }))
      };
    } catch (error) {
      await client?.close().catch(() => undefined);
      this.preparing.delete(config.id);
      this.lastErrors.set(
        config.id,
        sanitizeMcpError(error instanceof Error ? error.message : String(error))
      );
      this.retryAt.set(config.id, {
        key: configKey(config),
        until: Date.now() + CONNECT_RETRY_COOLDOWN_MS
      });
      await this.persistStatus();
      if (throwOnError) throw error;
      console.error(`MCP Server ${config.id} 不可用`, error);
      return undefined;
    }
  }

  async testRaw(rawText: string): Promise<{
    results: Array<{
      id: string;
      ok: boolean;
      tools?: number;
      resources?: number;
      prompts?: number;
      skipped?: boolean;
      error?: string;
    }>;
  }> {
    const raw = JSON.parse(rawText) as { mcpServers?: unknown };
    const servers =
      raw && typeof raw === 'object' && raw.mcpServers && typeof raw.mcpServers === 'object'
        ? Object.entries(raw.mcpServers as Record<string, unknown>)
        : [];
    if (servers.length === 0) throw new Error('mcpServers 不能为空');
    const results: Array<{
      id: string;
      ok: boolean;
      tools?: number;
      resources?: number;
      prompts?: number;
      skipped?: boolean;
      error?: string;
    }> = [];
    for (const [id, value] of servers) {
      const parsed = mcpServerConfigSchema.safeParse(value);
      if (!parsed.success) {
        results.push({ id, ok: false, error: '配置格式不合法' });
        continue;
      }
      if (parsed.data.enabled === false) {
        results.push({ id, ok: true, skipped: true });
        continue;
      }
      try {
        const connected = await this.connect(toConfig(id, parsed.data), true);
        if (!connected) throw new Error('连接失败');
        results.push({
          id,
          ok: true,
          tools: connected.tools.length,
          resources: connected.resources.length,
          prompts: connected.prompts.length
        });
        await connected.client.close().catch(() => undefined);
      } catch (error) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { results };
  }

  /**
   * 连接所有已启用的 MCP Server；并发调用复用同一次连接过程。
   */
  async listTools(signal?: AbortSignal): Promise<AgentToolDefinition[]> {
    if (signal?.aborted) return [];
    let pending = this.listToolsPromise;
    if (!pending) {
      pending = this.loadTools();
      this.listToolsPromise = pending;
      const clear = (): void => {
        if (this.listToolsPromise === pending) this.listToolsPromise = undefined;
      };
      pending.then(clear, clear);
    }
    if (!signal) return pending;

    // 预热可以被多个 Run 共享；停止某个 Run 时只停止等待，不打断后台预热
    return new Promise((resolve, reject) => {
      const onAbort = (): void => resolve([]);
      signal.addEventListener('abort', onAbort, { once: true });
      pending.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  /**
   * 在应用启动或配置变更后预热 MCP，避免首次发送时阻塞首 token。
   */
  async prewarm(): Promise<void> {
    await this.listTools();
  }

  private async loadTools(): Promise<AgentToolDefinition[]> {
    const generation = this.generation;
    const configs = (await this.readConfigs()).filter((config) => config.enabled !== false);
    const enabledIds = new Set(configs.map((config) => config.id));
    // 配置被禁用或删除后，关闭旧连接，避免已连接的 Server 继续暴露工具
    let pruned = false;
    for (const [id, server] of [...this.connected]) {
      if (enabledIds.has(id)) continue;
      await server.client.close().catch(() => undefined);
      this.connected.delete(id);
      this.connectionKeys.delete(id);
      this.lastErrors.delete(id);
      this.retryAt.delete(id);
      pruned = true;
    }
    if (pruned) await this.persistStatus();
    const now = Date.now();
    const pending = configs.filter((config) => {
      if (
        this.connected.has(config.id) &&
        this.connectionKeys.get(config.id) === configKey(config)
      ) {
        return false;
      }
      const retry = this.retryAt.get(config.id);
      return !retry || retry.key !== configKey(config) || retry.until <= now;
    });
    await forEachConcurrent(pending, CONNECT_CONCURRENCY, async (config) => {
      const key = configKey(config);
      const previous = this.connected.get(config.id);
      if (previous) {
        await previous.client.close().catch(() => undefined);
        this.connected.delete(config.id);
        this.connectionKeys.delete(config.id);
      }
      const connected = await this.connect(config);
      if (generation !== this.generation) {
        if (connected) await connected.client.close().catch(() => undefined);
        return;
      }
      if (connected) {
        this.connected.set(config.id, connected);
        this.connectionKeys.set(config.id, key);
      }
    });

    if (generation !== this.generation) return [];
    this.toolAliases.clear();
    const used = new Set<string>();
    const aliasFor = (serverId: string, toolName: string): string => {
      let candidate = mcpToolAlias(serverId, toolName);
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = mcpToolAlias(serverId, `${toolName}_${suffix}`);
        suffix += 1;
      }
      used.add(candidate);
      this.toolAliases.set(candidate, { serverId, toolName });
      return candidate;
    };

    return [...this.connected.values()].flatMap((server) => {
      const tools: AgentToolDefinition[] = server.tools.map((tool) => ({
        name: aliasFor(server.config.id, tool.name),
        description: tool.description ?? `MCP 工具 ${tool.name}`,
        permission: 'execute' as const,
        requiresApproval: true,
        inputSchema: tool.inputSchema as Record<string, unknown>
      }));
      if (server.resources.length) {
        tools.push(
          {
            name: aliasFor(server.config.id, 'resources_list'),
            description: `列出 MCP ${server.config.name} 的资源`,
            permission: 'execute',
            requiresApproval: true,
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: aliasFor(server.config.id, 'resources_read'),
            description: `读取 MCP ${server.config.name} 的资源`,
            permission: 'execute',
            requiresApproval: true,
            inputSchema: {
              type: 'object',
              properties: { uri: { type: 'string' } },
              required: ['uri']
            }
          }
        );
      }
      if (server.prompts.length) {
        tools.push(
          {
            name: aliasFor(server.config.id, 'prompts_list'),
            description: `列出 MCP ${server.config.name} 的提示词`,
            permission: 'execute',
            requiresApproval: true,
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: aliasFor(server.config.id, 'prompts_get'),
            description: `获取 MCP ${server.config.name} 的提示词`,
            permission: 'execute',
            requiresApproval: true,
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                arguments: { type: 'object' }
              },
              required: ['name']
            }
          }
        );
      }
      return tools;
    });
  }

  async call(
    name: string,
    input: unknown
  ): Promise<{
    ok: boolean;
    output: string;
    attachments?: McpAttachment[];
    error?: { code: string; message: string };
  }> {
    const alias = this.toolAliases.get(name);
    const configured = alias ? this.connected.get(alias.serverId) : undefined;
    if (!alias || !configured) {
      return {
        ok: false,
        output: '',
        error: { code: 'MCP_TOOL_NOT_FOUND', message: name }
      };
    }
    const toolName = alias.toolName;
    if (toolName === 'resources_list') {
      try {
        const result = await withTimeout(
          configured.client.listResources(),
          `MCP ${name} 调用超时`,
          CALL_TIMEOUT_MS
        );
        return { ok: true, output: JSON.stringify(result) };
      } catch (error) {
        return {
          ok: false,
          output: '',
          error: {
            code: 'MCP_CALL_FAILED',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
    if (toolName === 'resources_read') {
      const args = input as { uri?: unknown } | undefined;
      if (typeof args?.uri !== 'string') {
        return {
          ok: false,
          output: '',
          error: { code: 'MCP_INVALID_INPUT', message: '资源 URI 不能为空' }
        };
      }
      try {
        const result = await withTimeout(
          configured.client.readResource({ uri: args.uri }),
          `MCP ${name} 调用超时`,
          CALL_TIMEOUT_MS
        );
        const normalized = normalizeResourceResult(result);
        return {
          ok: true,
          output: normalized.text || JSON.stringify(result),
          ...(normalized.attachments.length ? { attachments: normalized.attachments } : {})
        };
      } catch (error) {
        return {
          ok: false,
          output: '',
          error: {
            code: 'MCP_CALL_FAILED',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
    if (toolName === 'prompts_list') {
      try {
        const result = await withTimeout(
          configured.client.listPrompts(),
          `MCP ${name} 调用超时`,
          CALL_TIMEOUT_MS
        );
        return { ok: true, output: JSON.stringify(result) };
      } catch (error) {
        return {
          ok: false,
          output: '',
          error: {
            code: 'MCP_CALL_FAILED',
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
    const tool = configured.tools.find((item) => item.name === toolName);
    if (!tool) {
      return { ok: false, output: '', error: { code: 'MCP_TOOL_NOT_FOUND', message: name } };
    }
    try {
      const result = await withTimeout(
        configured.client.callTool({
          name: tool.name,
          arguments: input as Record<string, unknown>
        }),
        `MCP ${name} 调用超时`,
        CALL_TIMEOUT_MS
      );
      const normalized = normalizeResult(result);
      const output = normalized.text || JSON.stringify(result);
      if (result && typeof result === 'object' && (result as { isError?: boolean }).isError) {
        return { ok: false, output, error: { code: 'MCP_TOOL_ERROR', message: output } };
      }
      return {
        ok: true,
        output,
        ...(normalized.attachments.length ? { attachments: normalized.attachments } : {})
      };
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          code: 'MCP_CALL_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  async dispose(): Promise<void> {
    this.generation += 1;
    this.listToolsPromise = undefined;
    for (const server of this.connected.values()) {
      await server.client.close().catch(() => undefined);
    }
    this.connected.clear();
    this.connectionKeys.clear();
    this.lastErrors.clear();
    this.preparing.clear();
    this.retryAt.clear();
  }
}
