/**
 * IPC 通道常量，命名规则为 domain:action。
 */

export const IPC_CHANNELS = {
  appGetInfo: 'app:getInfo',
  themeGetInfo: 'theme:getInfo',
  themeSetSource: 'theme:setSource',
  themeChanged: 'theme:changed',
  providerList: 'provider:list',
  providerSave: 'provider:save',
  providerRemove: 'provider:remove',
  sessionList: 'session:list',
  sessionCreate: 'session:create',
  sessionGet: 'session:get',
  sessionRename: 'session:rename',
  sessionRemove: 'session:remove',
  sessionSetPinned: 'session:setPinned',
  sessionEvents: 'session:events',
  workspaceChooseRoot: 'workspace:chooseRoot',
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event',
  approvalResolve: 'approval:resolve',
  checkpointRestore: 'checkpoint:restore',
  artifactRead: 'artifact:read'
} as const;

/**
 * 所有通道名的联合类型，供 preload 与主进程约束使用。
 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
