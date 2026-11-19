/// <reference types="vite/client" />

/**
 * 渲染进程全局类型：preload 注入的一次性 IPC 桥接入口。
 */

import type { NexusBridge } from '@shared/ipc/contracts';

declare global {
  interface Window {
    takeNexusBridge: () => NexusBridge | undefined;
  }
}

export {};
