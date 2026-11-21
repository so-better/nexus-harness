/**
 * MCP IPC：读取、保存和测试单个标准 mcp.json。
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import { fail, ok, type Result } from '@shared/ipc/result';
import type { McpServerStatus, McpTestResult } from '@shared/mcp';
import { getMcpService } from '../services/mcp/mcp-service-instance';

export const registerMcpIpc = (): void => {
  const service = getMcpService();

  ipcMain.handle(IPC_CHANNELS.mcpStatus, async (): Promise<Result<McpServerStatus[]>> => {
    try {
      return ok(await service.getStatus());
    } catch (error) {
      return fail('MCP_STATUS_FAILED', error instanceof Error ? error.message : '读取 MCP 状态失败');
    }
  });

  ipcMain.handle(IPC_CHANNELS.mcpRead, async (): Promise<Result<string>> => {
    try {
      return ok((await service.readRaw()) ?? '');
    } catch (error) {
      return fail('MCP_READ_FAILED', error instanceof Error ? error.message : '读取 MCP 配置失败');
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.mcpTest,
    async (_event, text: unknown): Promise<Result<McpTestResult>> => {
      if (typeof text !== 'string') return fail('MCP_INVALID_INPUT', 'MCP JSON 不合法');
      try {
        return ok(await service.testRaw(text));
      } catch (error) {
        return fail('MCP_TEST_FAILED', error instanceof Error ? error.message : 'MCP 测试失败');
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.mcpSave,
    async (_event, text: unknown): Promise<Result<{ ok: boolean }>> => {
      if (typeof text !== 'string') return fail('MCP_INVALID_INPUT', 'MCP JSON 不合法');
      try {
        await service.saveRaw(text);
        return ok({ ok: true });
      } catch (error) {
        return fail(
          'MCP_SAVE_FAILED',
          error instanceof Error ? error.message : '保存 MCP 配置失败'
        );
      }
    }
  );
};
