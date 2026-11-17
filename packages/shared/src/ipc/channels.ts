/* IPC 通道常量，命名规则为 domain:action。 */

export const IPC_CHANNELS = {
  appGetInfo: 'app:getInfo'
} as const;

/* 所有通道名的联合类型，供 preload 与主进程约束使用。 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
