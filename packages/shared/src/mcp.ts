/**
 * MCP Server 配置：采用标准 server 对象；目录名作为 Server id。
 */

import { z } from 'zod';

export const mcpTransportSchema = z.enum(['stdio', 'http', 'sse']);

export const mcpServerConfigSchema = z.object({
  type: mcpTransportSchema.optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  /** false 时不加载该 Server；缺失时按旧配置视为启用 */
  enabled: z.boolean().optional()
});

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpTransport = z.infer<typeof mcpTransportSchema>;

export interface McpConfig extends McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
}

export interface McpTestServerResult {
  id: string;
  ok: boolean;
  tools?: number;
  resources?: number;
  prompts?: number;
  skipped?: boolean;
  error?: string;
}

export interface McpTestResult {
  results: McpTestServerResult[];
}

export interface McpServerStatus {
  id: string;
  enabled: boolean;
  connected: boolean;
  tools: number;
  error?: string;
}
