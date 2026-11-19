/**
 * 渲染进程 IPC 桥接快照：应用模块持有桥接对象，插件无法再次取回。
 */

import type { NexusBridge } from '@shared/ipc/contracts';

const bridge = window.takeNexusBridge();
if (!bridge) throw new Error('IPC 桥接未注入或已被取走');

export const nexus: NexusBridge = bridge;
