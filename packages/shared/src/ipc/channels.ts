/* IPC 通道常量，命名规则为 domain:action。 */

export const IPC_CHANNELS = {
  appGetInfo: 'app:getInfo',
  themeGetInfo: 'theme:getInfo',
  themeSetSource: 'theme:setSource',
  themeChanged: 'theme:changed',
  providerList: 'provider:list',
  providerSave: 'provider:save',
  providerRemove: 'provider:remove',
  agentRun: 'agent:run'
} as const;

/* 所有通道名的联合类型，供 preload 与主进程约束使用。 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
