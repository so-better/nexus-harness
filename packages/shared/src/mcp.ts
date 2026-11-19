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
  headers: z.record(z.string(), z.string()).default({})
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
  error?: string;
}

export interface McpTestResult {
  results: McpTestServerResult[];
}
