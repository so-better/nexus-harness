/// <reference types="vite/client" />

/* 渲染进程全局类型：preload 注入的 window.nexus 桥接。 */

import type { NexusBridge } from '@shared/ipc/contracts';

declare global {
  interface Window {
    nexus: NexusBridge;
  }
}

export {};
