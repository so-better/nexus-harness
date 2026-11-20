/**
 * 命令注册表：命令面板、快捷键与菜单共用的唯一命令来源。
 */

import type { Unsubscribe } from '@shared/ipc/contracts';

export interface CommandDefinition {
  id: string;
  title: string | (() => string);
  description?: string;
  shortcut?: string;
  isEnabled?: () => boolean;
  handler: () => void | Promise<void>;
}

/**
 * 命令重名。
 */
export class DuplicateCommandError extends Error {
  constructor(id: string) {
    super(`命令已注册：${id}`);
    this.name = 'DuplicateCommandError';
  }
}

/**
 * 命令不存在。
 */
export class CommandNotFoundError extends Error {
  constructor(id: string) {
    super(`命令不存在：${id}`);
    this.name = 'CommandNotFoundError';
  }
}

/**
 * 命令当前不可执行。
 */
export class CommandDisabledError extends Error {
  constructor(id: string) {
    super(`命令当前不可用：${id}`);
    this.name = 'CommandDisabledError';
  }
}

/**
 * 进程内命令注册表；快捷键冲突检测与持久化后续接入。
 */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  /**
   * 注册命令，返回注销函数。
   */
  register(command: CommandDefinition): Unsubscribe {
    if (this.commands.has(command.id)) throw new DuplicateCommandError(command.id);
    this.commands.set(command.id, command);

    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id);
    };
  }

  /**
   * 读取命令定义。
   */
  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id);
  }

  /**
   * 列出全部命令，供命令面板渲染。
   */
  list(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  /**
   * 执行命令，统一处理不存在与禁用状态。
   */
  async execute(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new CommandNotFoundError(id);
    if (command.isEnabled && !command.isEnabled()) throw new CommandDisabledError(id);

    await command.handler();
  }

  /**
   * 清空注册表。
   */
  clear(): void {
    this.commands.clear();
  }
}
