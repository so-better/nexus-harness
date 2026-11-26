/**
 * 插件插槽注册表：宿主定义位置，插件只向容器内挂载内容。
 */

import type { Unsubscribe } from '@shared/ipc/contracts';
import type { PluginSlotLocation } from '@shared/plugin';
import type { UsageSummary } from '@shared/usage';

export type SlotLocation = PluginSlotLocation;

/**
 * 宿主注入给插槽的只读上下文。
 */
export interface SlotContext {
  location: SlotLocation;
  sessionId?: string | undefined;
  runId?: string | undefined;
  messageId?: string | undefined;
  role?: 'user' | 'assistant' | undefined;
  toolCallId?: string | undefined;
  approvalId?: string | undefined;
  fileId?: string | undefined;
  usage?: UsageSummary | undefined;
  /** 本条助手消息的生成耗时（毫秒） */
  durationMs?: number | undefined;
  /** 本条助手消息正文的字符数（Unicode 码点） */
  contentChars?: number | undefined;
  model?: string | undefined;
}

export type SlotMount = (element: HTMLElement, context: SlotContext) => Unsubscribe;

export interface SlotContribution {
  pluginId: string;
  id: string;
  location: SlotLocation;
  mount: SlotMount;
}

/**
 * 按 location 管理贡献，卸载时必须释放挂载函数返回的资源。
 */
export class SlotRegistry {
  private readonly contributions = new Map<string, SlotContribution>();

  /**
   * 注册插槽贡献，返回注销函数。
   */
  register(contribution: SlotContribution): Unsubscribe {
    const key = `${contribution.pluginId}:${contribution.location}:${contribution.id}`;
    if (this.contributions.has(key)) throw new Error(`插槽已注册：${key}`);
    this.contributions.set(key, contribution);

    return () => {
      if (this.contributions.get(key) === contribution) this.contributions.delete(key);
    };
  }

  /**
   * 列出指定位置的贡献。
   */
  list(location: SlotLocation): SlotContribution[] {
    return [...this.contributions.values()].filter((item) => item.location === location);
  }

  /**
   * 清空全部贡献。
   */
  clear(): void {
    this.contributions.clear();
  }
}

/**
 * 宿主全局插槽注册表。
 */
export const slotRegistry = new SlotRegistry();
