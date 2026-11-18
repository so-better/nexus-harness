/**
 * 工具注册表单元测试：注册、读取与重名保护。
 */

import { describe, expect, it } from 'vitest';
import { DuplicateToolError, ToolRegistry, type ToolDefinition } from './tool-registry';

const tool: ToolDefinition = {
  name: 'read_file',
  label: '读取文件',
  description: '读取工作区文件',
  permission: 'read',
  requiresApproval: false,
  timeoutMs: 10_000,
  maxOutputBytes: 64_000,
  idempotent: true
};

describe('ToolRegistry', () => {
  it('registers and lists tools', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(registry.get('read_file')).toEqual(tool);
    expect(registry.list()).toHaveLength(1);
  });

  it('rejects duplicate tool names', () => {
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(() => registry.register(tool)).toThrow(DuplicateToolError);
  });

  it('removes the tool when unregistering', () => {
    const registry = new ToolRegistry();
    const unregister = registry.register(tool);

    unregister();
    expect(registry.get('read_file')).toBeUndefined();
  });
});
