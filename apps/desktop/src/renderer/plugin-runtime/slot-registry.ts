/**
 * 插件插槽注册表：宿主定义位置，插件只向容器内挂载内容。
 */

import type { Unsubscribe } from '@shared/ipc/contracts';
import type { UsageSummary } from '@shared/usage';

export const SLOT_LOCATIONS = [
  'titlebar.actions',
  'sidebar.header',
  'sidebar.footer',
  'inspector.panel',
  'statusbar.left',
  'statusbar.right',
  'composer.toolbar',
  'composer.above',
  'composer.footer',
  'empty-state',
  'session.header.actions',
  'session.tab.badge',
  'session.item.actions',
  'message.assistant.header',
  'message.assistant.footer',
  'message.assistant.actions',
  'message.user.footer',
  'message.user.actions',
  'toolcall.body',
  'toolcall.footer',
  'approval.details',
  'filetree.header',
  'filetree.row',
  'filetree.actions',
  'editor.toolbar',
  'terminal.toolbar',
  'filecard.actions',
  'filecard.footer',
  'settings.section',
  'extensions.detail'
] as const;

export type SlotLocation = (typeof SLOT_LOCATIONS)[number];

/**
 * 宿主注入给插槽的只读上下文。
 */
export interface SlotContext {
  location: SlotLocation;
  sessionId?: string;
  runId?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  toolCallId?: string;
  approvalId?: string;
  fileId?: string;
  usage?: UsageSummary;
  model?: string;
}

export type SlotMount = (element: HTMLElement, context: SlotContext) => Unsubscribe;

export interface SlotContribution {
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
    const key = `${contribution.location}:${contribution.id}`;
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
