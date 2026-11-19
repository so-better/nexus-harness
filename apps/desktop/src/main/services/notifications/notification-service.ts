/**
 * 后台任务通知：窗口不在前台时提醒完成、失败、审批与提问。
 */

import { app, BrowserWindow, Notification } from 'electron';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import type { AppLanguage, NotificationBadgeStyle } from '@shared/ipc/contracts';

let notificationLanguage: AppLanguage = 'zh-CN';
let badgeStyle: NotificationBadgeStyle = 'dot';
const activeNotifications = new Set<Notification>();
let unreadNotificationCount = 0;

const notificationStrings = (): Record<string, string> =>
  notificationLanguage === 'en-US'
    ? {
        completed: 'Task completed',
        completedBody: 'Run completed',
        failed: 'Task failed',
        failedBody: 'Run failed',
        approval: 'Approval required',
        approvalBody: 'An action needs your confirmation',
        question: 'Answer required',
        questionBody: 'The agent is waiting for your answer'
      }
    : {
        completed: '任务完成',
        completedBody: 'Run 已完成',
        failed: '任务失败',
        failedBody: 'Run 执行失败',
        approval: '等待审批',
        approvalBody: '有操作需要你确认',
        question: '等待回答',
        questionBody: 'Agent 正在等待你的回答'
      };

/**
 * 设置通知文案语言。
 */
export const setNotificationLanguage = (language: AppLanguage): void => {
  notificationLanguage = language;
};

/**
 * 设置 Dock 角标样式。
 */
export const setNotificationBadgeStyle = (style: NotificationBadgeStyle): void => {
  badgeStyle = style;
  if (unreadNotificationCount > 0) {
    setBadge(
      badgeStyle === 'dot'
        ? '•'
        : unreadNotificationCount > 99
          ? '99+'
          : String(unreadNotificationCount)
    );
  }
};

const setBadge = (value: string): void => {
  try {
    if (app?.dock) {
      app.dock.setBadge(value);
      return;
    }
    const count = value ? Number.parseInt(value, 10) || 1 : 0;
    app?.setBadgeCount?.(count);
  } catch {
    // 平台不支持系统角标时忽略
  }
};

/**
 * 窗口重新获得焦点时清理待处理提醒。
 */
export const clearNotificationBadge = (): void => {
  unreadNotificationCount = 0;
  setBadge('');
};

let pendingSessionId: string | undefined;

export const consumePendingSession = (): string | null => {
  const sessionId = pendingSessionId ?? null;
  pendingSessionId = undefined;
  return sessionId;
};

const focusSession = (sessionId: string): void => {
  const window = BrowserWindow?.getFocusedWindow?.() ?? BrowserWindow?.getAllWindows?.()[0];
  if (!window) {
    pendingSessionId = sessionId;
    app?.emit?.('activate');
    clearNotificationBadge();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (!window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.sessionActivate, sessionId);
  }
  clearNotificationBadge();
};

const notificationText = (
  event: NexusEvent,
  sessionTitle: string
): { title: string; body: string } | undefined => {
  const strings = notificationStrings();
  switch (event.type) {
    case 'run.completed':
      return { title: strings.completed ?? '', body: `${sessionTitle} · ${strings.completedBody}` };
    case 'run.failed':
      return { title: strings.failed ?? '', body: `${sessionTitle} · ${strings.failedBody}` };
    case 'approval.requested':
      return { title: strings.approval ?? '', body: `${sessionTitle} · ${strings.approvalBody}` };
    case 'ask_user.requested':
      return { title: strings.question ?? '', body: `${sessionTitle} · ${strings.questionBody}` };
    default:
      return undefined;
  }
};

/**
 * 按事件发送系统通知；窗口在前台时不打扰。
 */
export const notifyAgentEvent = (event: NexusEvent, sessionTitle: string): void => {
  try {
    if (BrowserWindow?.getFocusedWindow?.()) return;
    if (!Notification?.isSupported?.()) return;
    const text = notificationText(event, sessionTitle);
    if (!text) return;

    const notification = new Notification(text);
    activeNotifications.add(notification);
    notification.on('close', () => activeNotifications.delete(notification));
    notification.on('click', () => focusSession(event.sessionId));
    notification.show();
    unreadNotificationCount += 1;
    setBadge(
      badgeStyle === 'dot'
        ? '•'
        : unreadNotificationCount > 99
          ? '99+'
          : String(unreadNotificationCount)
    );
  } catch {
    // 通知失败不能影响 Agent 事件流
  }
};
