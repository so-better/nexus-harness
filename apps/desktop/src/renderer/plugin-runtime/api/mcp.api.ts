/**
 * MCP API：读取、保存、测试标准 mcp.json。
 */

import { nexus } from '@/app/nexus-bridge';
import type { McpServerStatus, McpTestResult } from '@shared/mcp';
import { unwrap } from '@/app/ipc';

export const loadMcpConfig = async (): Promise<string> => unwrap(await nexus.mcp.load());

export const getMcpStatus = async (): Promise<McpServerStatus[]> =>
  unwrap(await nexus.mcp.status());

export const saveMcpConfig = async (text: string): Promise<void> => {
  unwrap(await nexus.mcp.save(text));
};

export const testMcpConfig = async (text: string): Promise<McpTestResult> =>
  unwrap(await nexus.mcp.test(text));
