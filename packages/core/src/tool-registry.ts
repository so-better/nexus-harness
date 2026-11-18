/**
 * 工具注册表骨架：登记工具元信息与权限，执行逻辑后续由 tools 包注入。
 */

import type { PermissionLevel } from './permissions';

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  permission: PermissionLevel;
  requiresApproval: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  idempotent: boolean;
}

/**
 * 工具重名时抛出，避免注册覆盖。
 */
export class DuplicateToolError extends Error {
  constructor(name: string) {
    super(`工具已注册：${name}`);
    this.name = 'DuplicateToolError';
  }
}

/**
 * 当前运行时可用工具的注册表。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * 注册工具，返回注销函数。
   */
  register(tool: ToolDefinition): () => void {
    if (this.tools.has(tool.name)) throw new DuplicateToolError(tool.name);
    this.tools.set(tool.name, tool);

    return () => {
      if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name);
    };
  }

  /**
   * 按名称读取工具定义。
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 列出全部工具，供 schema 注入与 UI 展示。
   */
  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /**
   * 清空注册表。
   */
  clear(): void {
    this.tools.clear();
  }
}
