/**
 * 构造带事件转发的 SessionService：会话生命周期事件追加后，
 * 转发给主进程插件事件总线与渲染层插件事件通道（session.removed 额外通知聊天缓存清理）。
 */
import type { DatabaseSync } from 'node:sqlite';
import { getPluginHost } from '../plugins/plugin-host-instance';
import { broadcastAgentEvent, broadcastPluginEvent } from '../plugins/plugin-events';
import type { EventStore } from './event-store';
import { SessionService } from './session-service';

export const createSessionService = (db: DatabaseSync, events: EventStore): SessionService =>
  new SessionService(db, events, (event) => {
    getPluginHost()?.emitEvent(event);
    broadcastPluginEvent(event);
    // 渲染层聊天缓存用 session.removed 清理已删除会话
    if (event.type === 'session.removed') broadcastAgentEvent(event);
  });
