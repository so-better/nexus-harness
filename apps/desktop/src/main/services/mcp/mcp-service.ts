/**
 * MCP 工具接入：扫描 userData/mcp，按需连接 stdio/http Server 并统一命名工具。
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import { getAppDataPaths } from '../storage/paths';

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
const CALL_TIMEOUT_MS = 60_000;

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
  private statusHydrated = false;

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
      const raw = JSON.parse(await readFile(join(this.directory, 'status.json'), 'utf8')) as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      for (const [id, value] of Object.entries(raw)) {
        if (typeof value === 'string') this.lastErrors.set(id, value);
      }
    } catch {
      // 状态文件缺失或损坏时忽略
    }
  }

  private async persistStatus(): Promise<void> {
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
    await this.dispose();
    await this.clearPersistedStatus();
  }

  private async connect(
    config: McpConfig,
    throwOnError = false
  ): Promise<ConnectedServer | undefined> {
    let client: Client | undefined;
    try {
      client = new Client({ name: 'nexus', version: '0.1.0' }, { capabilities: {} });
      if (config.transport === 'http' || config.transport === 'sse') {
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
        if (!config.command) throw new Error('缺少 command');
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            PATH: process.env['PATH'] ?? '',
            HOME: process.env['HOME'] ?? '',
            USER: process.env['USER'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? '',
            SystemRoot: process.env['SystemRoot'] ?? '',
            ...config.env
          },
          stderr: 'ignore'
        });
        await withTimeout(client.connect(transport), `MCP ${config.id} 连接超时`);
      }
      const listed = await withTimeout(client.listTools(), `MCP ${config.id} 列举工具超时`);
      this.lastErrors.delete(config.id);
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
      this.lastErrors.set(config.id, error instanceof Error ? error.message : String(error));
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

  async listTools(): Promise<AgentToolDefinition[]> {
    const configs = (await this.readConfigs()).filter((config) => config.enabled !== false);
    const enabledIds = new Set(configs.map((config) => config.id));
    // 配置被禁用或删除后，关闭旧连接，避免已连接的 Server 继续暴露工具
    const configKey = (config: McpConfig): string =>
      JSON.stringify([config.transport, config.command, config.args, config.env, config.url, config.headers]);
    let pruned = false;
    for (const [id, server] of [...this.connected]) {
      if (enabledIds.has(id)) continue;
      await server.client.close().catch(() => undefined);
      this.connected.delete(id);
      this.connectionKeys.delete(id);
      this.lastErrors.delete(id);
      pruned = true;
    }
    if (pruned) await this.persistStatus();
    for (const config of configs) {
      const key = configKey(config);
      if (this.connected.has(config.id) && this.connectionKeys.get(config.id) === key) continue;
      const previous = this.connected.get(config.id);
      if (previous) {
        await previous.client.close().catch(() => undefined);
        this.connected.delete(config.id);
        this.connectionKeys.delete(config.id);
      }
      const connected = await this.connect(config);
      if (connected) {
        this.connected.set(config.id, connected);
        this.connectionKeys.set(config.id, key);
      }
    }

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
    for (const server of this.connected.values()) {
      await server.client.close().catch(() => undefined);
    }
    this.connected.clear();
    this.connectionKeys.clear();
    this.lastErrors.clear();
  }
}
