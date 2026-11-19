/**
 * 插件宿主单例：主进程入口创建，IPC 与 Agent 事件转发共用。
 */

import type { PluginHost } from './plugin-host';

let host: PluginHost | undefined;

export const setPluginHost = (instance: PluginHost): void => {
  host = instance;
};

export const getPluginHost = (): PluginHost | undefined => host;
