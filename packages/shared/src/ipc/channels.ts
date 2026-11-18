/**
 * IPC 通道常量，命名规则为 domain:action。
 */

export const IPC_CHANNELS = {
  appGetInfo: 'app:getInfo',
  themeGetInfo: 'theme:getInfo',
  themeSetSource: 'theme:setSource',
  themeChanged: 'theme:changed',
  settingsGetAutoLaunch: 'settings:getAutoLaunch',
  settingsSetAutoLaunch: 'settings:setAutoLaunch',
  settingsGetLanguage: 'settings:getLanguage',
  settingsSetLanguage: 'settings:setLanguage',
  cacheGetInfo: 'cache:getInfo',
  cacheClear: 'cache:clear',
  providerList: 'provider:list',
  providerSave: 'provider:save',
  providerRemove: 'provider:remove',
  providerTest: 'provider:test',
  sessionList: 'session:list',
  sessionCreate: 'session:create',
  sessionGet: 'session:get',
  sessionRename: 'session:rename',
  sessionRemove: 'session:remove',
  sessionClearAll: 'session:clearAll',
  sessionSearch: 'session:search',
  sessionSetPinned: 'session:setPinned',
  sessionSetModel: 'session:setModel',
  sessionSetMode: 'session:setMode',
  sessionRoots: 'session:roots',
  sessionAddRoots: 'session:addRoots',
  sessionRemoveRoot: 'session:removeRoot',
  sessionEvents: 'session:events',
  sessionChanged: 'session:changed',
  workspaceChooseRoot: 'workspace:chooseRoot',
  workspaceSearchFiles: 'workspace:searchFiles',
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  agentEvent: 'agent:event',
  agentAnswerUser: 'agent:answerUser',
  filesSaveAs: 'files:saveAs',
  approvalResolve: 'approval:resolve',
  checkpointDiff: 'checkpoint:diff',
  checkpointOpenFile: 'checkpoint:openFile',
  checkpointRestore: 'checkpoint:restore',
  artifactRead: 'artifact:read'
} as const;

/**
 * 所有通道名的联合类型，供 preload 与主进程约束使用。
 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
