/**
 * MCP 服务单例：Agent IPC 使用，应用退出时统一释放子进程。
 */

import { McpService } from './mcp-service';

let instance: McpService | undefined;

export const getMcpService = (): McpService => {
  instance ??= new McpService();
  return instance;
};

export const disposeMcpService = async (): Promise<void> => {
  await instance?.dispose();
  instance = undefined;
};
