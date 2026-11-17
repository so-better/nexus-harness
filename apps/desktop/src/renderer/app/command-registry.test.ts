/* 命令注册表单元测试：注册、执行、禁用与重名保护。 */

import { describe, expect, it, vi } from 'vitest';
import { CommandDisabledError, CommandRegistry, DuplicateCommandError } from './command-registry';

describe('CommandRegistry', () => {
  it('registers and executes commands', async () => {
    const registry = new CommandRegistry();
    const handler = vi.fn();
    registry.register({ id: 'session.new', title: '新建会话', handler });

    await registry.execute('session.new');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate command ids', () => {
    const registry = new CommandRegistry();
    const command = { id: 'session.new', title: '新建会话', handler: () => undefined };
    registry.register(command);

    expect(() => registry.register(command)).toThrow(DuplicateCommandError);
  });

  it('rejects disabled commands', async () => {
    const registry = new CommandRegistry();
    registry.register({
      id: 'session.export',
      title: '导出会话',
      isEnabled: () => false,
      handler: () => undefined
    });

    await expect(registry.execute('session.export')).rejects.toThrow(CommandDisabledError);
  });
});
