/**
 * 自定义标题栏窗口控制 API。
 */

import { nexus } from './nexus-bridge';
import { unwrap } from './ipc';

export const minimizeWindow = async (): Promise<void> => {
  await unwrap(await nexus.window.minimize());
};

export const toggleMaximizeWindow = async (): Promise<boolean> => {
  return unwrap(await nexus.window.toggleMaximize()).maximized;
};

export const closeWindow = async (): Promise<void> => {
  await unwrap(await nexus.window.close());
};

export const isWindowMaximized = async (): Promise<boolean> => {
  return unwrap(await nexus.window.isMaximized()).maximized;
};

export const onWindowMaximizedChange = (handler: (maximized: boolean) => void): (() => void) =>
  nexus.window.onMaximizedChange(handler);
