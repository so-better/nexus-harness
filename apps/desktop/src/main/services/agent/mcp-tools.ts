/**
 * MCP 管理工具：读取脱敏配置、保存、刷新和测试 Server。
 */
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import type { McpService } from '../mcp/mcp-service';
import { getMcpService } from '../mcp/mcp-service-instance';

export interface McpToolOptions {
  service?: McpService;
}

const MASK = '••••';
const emptySchema = z.object({}).strict();
const saveSchema = z.object({ raw: z.string().min(1).max(1_000_000) }).strict();
const updateSchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    remove: z.boolean().optional()
  })
  .strict()
  .refine(
    (value) => value.enabled !== undefined || value.config !== undefined || value.remove === true,
    {
      message: '至少需要 enabled、config 或 remove'
    }
  );
const testSchema = z
  .object({
    raw: z.string().min(1).max(1_000_000).optional(),
    serverId: z.string().min(1).optional()
  })
  .strict();

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const mcpToolDefinitions: AgentToolDefinition[] = [
  tool(
    'mcp_update',
    '局部更新或删除单个 MCP Server；只传需要修改的字段，不需要重写整份 JSON。',
    {
      id: { type: 'string' },
      enabled: { type: 'boolean' },
      config: { type: 'object' },
      remove: { type: 'boolean' }
    },
    ['id'],
    true
  ),
  tool('mcp_list', '列出 MCP Server 的启用、连接状态、工具数量和错误。', {}, [], false),
  tool('mcp_read', '读取脱敏后的 MCP 配置；环境变量和请求头值以掩码显示。', {}, [], false),
  tool(
    'mcp_save',
    '保存 MCP 配置；掩码字段会保留原有密钥，保存后后台预热。',
    { raw: { type: 'string' } },
    ['raw'],
    true
  ),
  tool('mcp_refresh', '释放现有 MCP 连接并按当前配置重新预热。', {}, [], true),
  tool(
    'mcp_test',
    '测试当前或传入的 MCP 配置；会启动 Server 进程，需要审批。',
    { raw: { type: 'string' }, serverId: { type: 'string' } },
    [],
    true
  )
];

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const parseServers = (raw: string): Record<string, unknown> => {
  const parsed = JSON.parse(raw) as { mcpServers?: unknown };
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.mcpServers ||
    typeof parsed.mcpServers !== 'object' ||
    Array.isArray(parsed.mcpServers)
  ) {
    throw new Error('mcp.json 必须包含 mcpServers 对象');
  }
  return parsed.mcpServers as Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|passwd|api[-_]?key|private[-_]?key|client[-_]?secret)/i;

const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY_PATTERN.test(key);
const MASKED_URL_PART = 'nexus-masked-value';

const looksSecret = (value: string): boolean =>
  /^(sk-|Bearer\s|ghp_|xox[bp]-)[A-Za-z0-9._~+/=-]+$/i.test(value) ||
  /^[A-Za-z0-9._~+/=-]{32,}$/.test(value);

const redactUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.username) url.username = MASKED_URL_PART;
    if (url.password) url.password = MASKED_URL_PART;
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) url.searchParams.set(key, MASKED_URL_PART);
    }
    return url.toString();
  } catch {
    return value;
  }
};

const redactArgs = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  return value.map((item) => (typeof item === 'string' && looksSecret(item) ? MASK : item));
};

/**
 * env 全部脱敏；headers 只遮蔽敏感字段，保留 Accept/Content-Type 等可读配置。
 */
const redactStringRecord = (value: unknown, maskAll = false): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      maskAll || isSensitiveKey(key) ? MASK : item
    ])
  );
};

/**
 * 配置读取时隐藏 env/headers 值，避免密钥进入模型上下文。
 */
const redactRaw = (raw: string): string => {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const servers = parseServers(raw);
  const redacted = Object.fromEntries(
    Object.entries(servers).map(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [id, value];
      const server = { ...(value as Record<string, unknown>) };
      if (server['env']) server['env'] = redactStringRecord(server['env'], true);
      if (server['headers']) server['headers'] = redactStringRecord(server['headers']);
      if (server['args']) server['args'] = redactArgs(server['args']);
      if (typeof server['url'] === 'string') server['url'] = redactUrl(server['url']);
      return [id, server];
    })
  );
  parsed['mcpServers'] = redacted;
  return `${JSON.stringify(parsed, null, 2)}\n`;
};

const restoreUrl = (value: string, previousValue: unknown): string => {
  if (!value.includes(MASKED_URL_PART)) return value;
  try {
    const url = new URL(value);
    const previous = typeof previousValue === 'string' ? new URL(previousValue) : undefined;
    if (url.username === MASKED_URL_PART) {
      if (!previous?.username) throw new Error('URL 用户名不能使用掩码，请提供实际值');
      url.username = previous.username;
    }
    if (url.password === MASKED_URL_PART) {
      if (!previous?.password) throw new Error('URL 密码不能使用掩码，请提供实际值');
      url.password = previous.password;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (url.searchParams.get(key) !== MASKED_URL_PART) continue;
      const previousValueForKey = previous?.searchParams.get(key);
      if (previousValueForKey === null || previousValueForKey === undefined) {
        throw new Error(`URL 参数 ${key} 不能使用掩码，请提供实际值`);
      }
      url.searchParams.set(key, previousValueForKey);
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.includes('请提供')) throw error;
    return value;
  }
};

/**
 * 保存/测试前恢复掩码字段；新增 Server 的掩码没有旧值可恢复时直接报错。
 */
const restoreMaskedValues = (incomingRaw: string, currentRaw: string | undefined): string => {
  const incoming = JSON.parse(incomingRaw) as Record<string, unknown>;
  const servers = parseServers(incomingRaw);
  const currentServers = currentRaw ? parseServers(currentRaw) : {};
  const restored = Object.fromEntries(
    Object.entries(servers).map(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [id, value];
      const server = { ...(value as Record<string, unknown>) };
      const previous =
        currentServers[id] && typeof currentServers[id] === 'object'
          ? (currentServers[id] as Record<string, unknown>)
          : undefined;
      for (const field of ['env', 'headers'] as const) {
        const values = server[field];
        if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
        const previousValues =
          previous?.[field] && typeof previous[field] === 'object'
            ? (previous[field] as Record<string, unknown>)
            : {};
        const next = { ...(values as Record<string, unknown>) };
        for (const [key, item] of Object.entries(next)) {
          if (item !== MASK) continue;
          if (typeof previousValues[key] !== 'string') {
            throw new Error(`新增的 ${field}.${key} 不能使用掩码，请提供实际值`);
          }
          next[key] = previousValues[key];
        }
        server[field] = next;
      }
      if (Array.isArray(server['args'])) {
        const previousArgs = Array.isArray(previous?.['args']) ? previous['args'] : [];
        server['args'] = server['args'].map((item, index) => {
          if (item !== MASK) return item;
          if (typeof previousArgs[index] !== 'string') {
            throw new Error(`args 第 ${index + 1} 项不能使用掩码，请提供实际值`);
          }
          return previousArgs[index];
        });
      }
      if (typeof server['url'] === 'string') {
        server['url'] = restoreUrl(server['url'], previous?.['url']);
      }
      return [id, server];
    })
  );
  incoming['mcpServers'] = restored;
  return `${JSON.stringify(incoming, null, 2)}\n`;
};

const getService = (options: McpToolOptions): McpService => options.service ?? getMcpService();

/**
 * 执行 MCP 管理工具；配置读取脱敏，写操作需要审批。
 */
export const executeMcpTool = async (
  name: string,
  input: unknown,
  options: McpToolOptions = {}
): Promise<ToolExecutionResult> => {
  const service = getService(options);

  if (name === 'mcp_list') {
    if (!emptySchema.safeParse(input).success) return failure('MCP_INVALID_INPUT', '参数不合法');
    return success({ servers: await service.getStatus() });
  }

  if (name === 'mcp_read') {
    if (!emptySchema.safeParse(input).success) return failure('MCP_INVALID_INPUT', '参数不合法');
    const raw = await service.readRaw();
    if (raw === undefined) return success({ raw: '' });
    try {
      return success({ raw: redactRaw(raw) });
    } catch (error) {
      return failure(
        'MCP_INVALID_CONFIG',
        error instanceof Error ? error.message : 'MCP 配置不合法'
      );
    }
  }

  if (name === 'mcp_save') {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) return failure('MCP_INVALID_INPUT', 'MCP 配置不合法');
    try {
      const current = await service.readRaw();
      const raw = restoreMaskedValues(parsed.data.raw, current);
      await service.saveRaw(raw);
      service.prewarm().catch((error: unknown) => console.error('MCP 预热失败', error));
      return success({ servers: await service.getStatus(), prewarming: true });
    } catch (error) {
      return failure(
        'MCP_SAVE_FAILED',
        error instanceof Error ? error.message : '保存 MCP 配置失败'
      );
    }
  }

  if (name === 'mcp_update') {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return failure('MCP_INVALID_INPUT', 'MCP 更新参数不合法');
    try {
      const current = await service.readRaw();
      const raw = JSON.parse(current ?? '{}') as { mcpServers?: Record<string, unknown> };
      if (!raw.mcpServers) raw.mcpServers = {};
      if (parsed.data.remove) {
        delete raw.mcpServers[parsed.data.id];
      } else {
        const previous = raw.mcpServers[parsed.data.id];
        if (!previous && parsed.data.config === undefined) {
          return failure('MCP_SERVER_NOT_FOUND', 'MCP Server 不存在');
        }
        const next =
          previous && typeof previous === 'object'
            ? { ...(previous as Record<string, unknown>), ...(parsed.data.config ?? {}) }
            : { ...(parsed.data.config ?? {}) };
        if (parsed.data.enabled !== undefined) next['enabled'] = parsed.data.enabled;
        raw.mcpServers[parsed.data.id] = next;
      }
      const restored = restoreMaskedValues(`${JSON.stringify(raw, null, 2)}\n`, current);
      await service.saveRaw(restored);
      service.prewarm().catch((error: unknown) => console.error('MCP 预热失败', error));
      return success({ servers: await service.getStatus(), prewarming: true });
    } catch (error) {
      return failure(
        'MCP_UPDATE_FAILED',
        error instanceof Error ? error.message : '更新 MCP 配置失败'
      );
    }
  }

  if (name === 'mcp_refresh') {
    if (!emptySchema.safeParse(input).success) return failure('MCP_INVALID_INPUT', '参数不合法');
    try {
      await service.dispose();
      await service.prewarm();
      return success({ servers: await service.getStatus() });
    } catch (error) {
      return failure(
        'MCP_REFRESH_FAILED',
        error instanceof Error ? error.message : '刷新 MCP 失败'
      );
    }
  }

  if (name === 'mcp_test') {
    const parsed = testSchema.safeParse(input);
    if (!parsed.success) return failure('MCP_INVALID_INPUT', 'MCP 配置不合法');
    try {
      const current = await service.readRaw();
      let raw = restoreMaskedValues(parsed.data.raw ?? current ?? '', current);
      if (parsed.data.serverId) {
        const parsedRaw = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
        const server = parsedRaw.mcpServers?.[parsed.data.serverId];
        if (!server) return failure('MCP_SERVER_NOT_FOUND', 'MCP Server 不存在');
        parsedRaw.mcpServers = { [parsed.data.serverId]: server };
        raw = JSON.stringify(parsedRaw);
      }
      return success(await service.testRaw(raw));
    } catch (error) {
      return failure('MCP_TEST_FAILED', error instanceof Error ? error.message : '测试 MCP 失败');
    }
  }

  return failure('MCP_UNKNOWN_ACTION', `未知 MCP 操作：${name}`);
};
