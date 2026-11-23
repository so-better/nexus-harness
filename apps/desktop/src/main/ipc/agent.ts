/**
 * Agent IPC：异步启动 Run、持久化事件、转发事件并支持按窗口取消。
 */

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  agentRunInputSchema,
  approvalResolveInputSchema,
  type AgentCancelResult,
  type AgentStartResult,
  type ApprovalResolveResult,
  type SessionSummary
} from '@shared/ipc/contracts';
import { askUserResolveInputSchema, type AskUserResolveResult } from '@shared/ask-user';
import { fail, ok, type Result } from '@shared/ipc/result';
import { AgentService, createAgentProvider } from '../services/agent/agent-service';
import { createSkillService } from '../services/skills/skill-service';
import { getMcpService } from '../services/mcp/mcp-service-instance';
import { approvalService } from '../services/agent/approval-service';
import { canAutoApproveWorkspace } from '../services/agent/approval-policy';
import { askUserService } from '../services/agent/ask-user-service';
import { workspaceAuthService } from '../services/agent/workspace-auth-service';
import { providerStore } from '../services/provider/provider-store';
import { getDatabase } from '../services/storage/database';
import { EventStore } from '../services/session/event-store';
import { RunStore } from '../services/session/run-store';
import { SessionService } from '../services/session/session-service';
import { generateSessionTitle } from '../services/session/session-title';
import { getPluginHost } from '../services/plugins/plugin-host-instance';
import { notifyAgentEvent } from '../services/notifications/notification-service';
import { SessionHistoryService } from '../services/session/session-history';
import { AttachmentService } from '../services/attachments/attachment-service';
import { loadImageSettings } from '../services/settings/image-settings';
import { loadSearchSettings } from '../services/settings/search-settings';
import { loadAgentSettings } from '../services/settings/agent-settings';
import {
  getRun,
  getRunForSession,
  hasRunForSession,
  registerRun,
  unregisterRun,
  type ActiveRun
} from '../services/agent/run-registry';

/**
 * 从工具参数提取用户实际请求的路径，避免无工作区时只能授权 Desktop。
 * 文件名会转换为所在目录；相对路径以用户主目录为基准。
 */
const workspacePathFromCall = async (name: string, input: unknown): Promise<string | undefined> => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const raw = name === 'run_command' ? record['cwd'] : (record['path'] ?? record['cwd']);
  if (typeof raw !== 'string' || !raw.trim()) return undefined;

  const home = app.getPath('home');
  const expanded = raw === '~' ? home : raw.startsWith('~/') ? join(home, raw.slice(2)) : raw;
  if (!isAbsolute(expanded)) return undefined;
  const candidate = expanded;
  let current = candidate;
  for (;;) {
    try {
      const info = await stat(current);
      return info.isDirectory() ? current : dirname(current);
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
};

/**
 * 统一取消活跃 Run，并同时释放审批、提问与目录授权等待。
 */
const cancelActiveRun = (active: ActiveRun): void => {
  approvalService.cancelRun(active.runId);
  askUserService.cancelRun(active.runId);
  workspaceAuthService.cancelRun(active.runId);
  active.controller.abort();
};

/**
 * 注册 agent:run、agent:cancel 与 agent:cancelSession；事件只回传给发起窗口。
 */
export const registerAgentIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);
  const runs = new RunStore(db);
  const history = new SessionHistoryService(events);
  const attachments = new AttachmentService(db);
  const agentService = new AgentService({
    database: db,
    skills: createSkillService(),
    mcp: getMcpService(),
    imageSettings: loadImageSettings,
    searchSettings: loadSearchSettings,
    memoryExtraction: true,
    generalSettings: {
      onChange: (state) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IPC_CHANNELS.settingsGeneralChanged, state);
        }
      }
    }
  });

  const broadcastSession = (session: SessionSummary): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.sessionChanged, session);
    }
  };

  ipcMain.handle(
    IPC_CHANNELS.agentRun,
    async (event, rawInput: unknown): Promise<Result<AgentStartResult>> => {
      const parsed = agentRunInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('AGENT_INVALID_INPUT', 'Agent 运行参数不合法', parsed.error.flatten());
      }

      try {
        const session = sessions.get(parsed.data.sessionId);
        if (!session) {
          return fail('SESSION_NOT_FOUND', `会话不存在：${parsed.data.sessionId}`);
        }
        if (hasRunForSession(parsed.data.sessionId)) {
          return fail('SESSION_BUSY', `会话已有运行中的 Run：${parsed.data.sessionId}`);
        }

        const provider = await providerStore.get(parsed.data.providerId);
        if (!provider) {
          return fail('PROVIDER_NOT_FOUND', `Provider 不存在：${parsed.data.providerId}`);
        }
        if (!provider.enabled) {
          return fail('PROVIDER_DISABLED', `Provider 已停用：${parsed.data.providerId}`);
        }
        if (
          !provider.models.some(
            (model) => model.id === parsed.data.modelId && model.role !== 'image'
          )
        ) {
          return fail('PROVIDER_MODEL_NOT_FOUND', `对话模型不存在：${parsed.data.modelId}`);
        }

        if (parsed.data.editMessageId && parsed.data.regenerateMessageId) {
          return fail('AGENT_INVALID_INPUT', '不能同时编辑和重新生成');
        }

        let runHistory = history.load(session.id);
        let branchMessageId = parsed.data.editMessageId ?? parsed.data.regenerateMessageId;
        let isErrorRetry = false;
        if (branchMessageId) {
          const allEvents = events.list(session.id);
          let boundary = -1;
          if (parsed.data.regenerateMessageId && !parsed.data.editMessageId) {
            boundary = allEvents.findIndex(
              (item) =>
                item.type === 'message.completed' &&
                (item.payload as { messageId?: string }).messageId === branchMessageId
            );
            const role =
              boundary >= 0 && allEvents[boundary]?.type === 'message.completed'
                ? (allEvents[boundary]?.payload as { role?: string }).role
                : undefined;

            // 错误气泡没有持久化 message.completed；重新生成时回退到最后一条用户消息
            if (boundary < 0 || role !== 'assistant') {
              isErrorRetry = true;
              for (let index = allEvents.length - 1; index >= 0; index -= 1) {
                const item = allEvents[index];
                if (item?.type !== 'message.completed') continue;
                if ((item.payload as { role?: string }).role !== 'user') continue;
                boundary = index;
                branchMessageId = (item.payload as { messageId: string }).messageId;
                break;
              }
              if (boundary < 0) {
                return fail('SESSION_MESSAGE_NOT_FOUND', '找不到可重试的用户消息');
              }
            }
          } else {
            boundary = allEvents.findIndex(
              (item) =>
                item.type === 'message.completed' &&
                (item.payload as { messageId?: string }).messageId === branchMessageId
            );
            if (boundary < 0) {
              return fail('SESSION_MESSAGE_NOT_FOUND', '要修改的消息不存在');
            }
            const target = allEvents[boundary];
            const role =
              target?.type === 'message.completed'
                ? (target.payload as { role?: string }).role
                : undefined;
            if (parsed.data.editMessageId && role !== 'user') {
              return fail('SESSION_MESSAGE_INVALID', '只能编辑用户消息');
            }
          }

          if (parsed.data.editMessageId) {
            events.append(
              createNexusEvent({
                sessionId: session.id,
                seq: 1,
                type: 'message.edited',
                payload: {
                  messageId: branchMessageId,
                  content: parsed.data.prompt,
                  ...(parsed.data.references?.length ? { references: parsed.data.references } : {}),
                  ...(parsed.data.attachmentIds?.length
                    ? {
                        attachments: parsed.data.attachmentIds
                          .map((id) => attachments.get(id, session.id))
                          .filter((attachment): attachment is NonNullable<typeof attachment> =>
                            Boolean(attachment)
                          )
                      }
                    : {})
                }
              })
            );
          } else {
            const sourceMessageId = [...allEvents.slice(0, boundary)].reverse().find((item) => {
              if (item.type !== 'message.completed') return false;
              return (item.payload as { role?: string }).role === 'user';
            });
            events.append(
              createNexusEvent({
                sessionId: session.id,
                seq: 1,
                type: 'message.regenerated',
                payload: {
                  messageId: parsed.data.regenerateMessageId ?? branchMessageId,
                  sourceMessageId: isErrorRetry
                    ? branchMessageId
                    : sourceMessageId?.type === 'message.completed'
                      ? (sourceMessageId.payload as { messageId: string }).messageId
                      : branchMessageId
                }
              })
            );
          }

          const superseded = new Set<string>();
          const branchEvents = allEvents.slice(isErrorRetry ? boundary + 1 : boundary);
          for (const item of branchEvents) {
            if (item.type === 'message.completed') {
              superseded.add((item.payload as { messageId: string }).messageId);
            }
          }
          if (isErrorRetry) {
            // 失败 Run 可能只有流式增量或工具卡片，没有 message.completed
            for (const item of branchEvents) {
              if (item.type === 'message.delta') {
                superseded.add((item.payload as { messageId: string }).messageId);
              } else if (item.type === 'tool.requested' || item.type === 'file.created') {
                superseded.add(`assistant-${item.id}`);
              }
            }
            if (parsed.data.regenerateMessageId) {
              superseded.add(parsed.data.regenerateMessageId);
            }
          }
          for (const messageId of superseded) {
            const stored = events.append(
              createNexusEvent({
                sessionId: session.id,
                seq: 1,
                type: 'message.superseded',
                payload: {
                  messageId,
                  reason: parsed.data.editMessageId ? 'edited' : 'regenerated'
                }
              })
            );
            if (!event.sender.isDestroyed()) {
              event.sender.send(IPC_CHANNELS.agentEvent, stored);
            }
          }
          runHistory = history.load(session.id, branchMessageId);
        }

        const shouldGenerateTitle = session.titleSource === 'auto' && session.title === '新会话';
        let titleGenerationStarted = false;
        /**
         * 自动标题会占用一次模型请求，推迟到首个输出或 Run 结束后再发起，避免抢首 token。
         */
        const startTitleGeneration = (): void => {
          if (!shouldGenerateTitle || titleGenerationStarted) return;
          titleGenerationStarted = true;
          generateSessionTitle(
            createAgentProvider(provider),
            parsed.data.modelId,
            parsed.data.prompt.trim() ||
              parsed.data.references?.map((reference) => reference.name).join(', ') ||
              '',
            provider.extraParams
          )
            .then(({ title, usage }) => {
              const updated = sessions.setAutoTitle(session.id, title);
              if (updated) broadcastSession(updated);
              if (usage) {
                events.append(
                  createNexusEvent({
                    sessionId: session.id,
                    seq: 1,
                    type: 'usage.recorded',
                    payload: {
                      provider: provider.name,
                      model: parsed.data.modelId,
                      inputTokens: usage.inputTokens,
                      outputTokens: usage.outputTokens,
                      ...(usage.cost === undefined ? {} : { cost: usage.cost })
                    }
                  })
                );
              }
            })
            .catch((error: unknown) => console.error('自动标题生成失败', error));
        };

        const runId = randomUUID();
        const controller = new AbortController();
        const sender = event.sender;
        const senderId = sender.id;
        const onSenderDestroyed = (): void => {
          approvalService.cancelRun(runId);
          askUserService.cancelRun(runId);
          workspaceAuthService.cancelRun(runId);
          controller.abort();
        };
        sender.once('destroyed', onSenderDestroyed);
        const onAbort = (): void => workspaceAuthService.cancelRun(runId);
        controller.signal.addEventListener('abort', onAbort, { once: true });
        registerRun({ runId, sessionId: parsed.data.sessionId, senderId, controller });

        try {
          runs.create(runId, parsed.data.sessionId);
          sessions.setStatus(parsed.data.sessionId, 'running');
        } catch (error) {
          unregisterRun(runId);
          throw error;
        }

        let eventChain: Promise<void> = Promise.resolve();
        let terminalEventSent = false;

        const sendEvent = (payload: NexusEvent): void => {
          try {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.agentEvent, payload);
          } catch (error) {
            console.error('Agent 事件推送失败', error);
          }
        };

        /**
         * 先落库再推送；失败时仍推送原事件，避免 UI 卡住。
         */
        /**
         * 所有事件按统一队列发送；增量文本不落库，但必须排在已持久化事件之后。
         */
        const enqueueEvent = (agentEvent: NexusEvent): void => {
          eventChain = eventChain.then(() => {
            try {
              const stored = events.append(agentEvent);
              applyTerminalState(stored);
              sendEvent(stored);
              notifyAgentEvent(stored, sessions.get(stored.sessionId)?.title ?? 'Nexus');
              getPluginHost()?.emitEvent(stored);
            } catch (error) {
              console.error('Agent 事件持久化失败', error);
              controller.abort();
              sendEvent({ ...agentEvent, persisted: false });
            }
          });
        };

        const applyTerminalState = (agentEvent: NexusEvent): void => {
          if (agentEvent.type === 'run.completed') {
            runs.updateStatus(runId, 'succeeded');
            sessions.setStatus(parsed.data.sessionId, 'completed');
          } else if (agentEvent.type === 'run.failed') {
            runs.updateStatus(runId, 'failed');
            sessions.setStatus(parsed.data.sessionId, 'failed');
          } else if (agentEvent.type === 'run.cancelled') {
            runs.updateStatus(runId, 'cancelled');
            sessions.setStatus(parsed.data.sessionId, 'interrupted');
          } else if (agentEvent.type === 'approval.requested') {
            runs.updateStatus(runId, 'waiting_approval');
            sessions.setStatus(parsed.data.sessionId, 'waiting_approval');
          } else if (agentEvent.type === 'approval.resolved') {
            runs.updateStatus(runId, 'running');
            sessions.setStatus(parsed.data.sessionId, 'running');
          } else if (agentEvent.type === 'ask_user.requested') {
            runs.updateStatus(runId, 'waiting_user');
            sessions.setStatus(parsed.data.sessionId, 'waiting_user');
          } else if (agentEvent.type === 'ask_user.resolved') {
            runs.updateStatus(runId, 'running');
            sessions.setStatus(parsed.data.sessionId, 'running');
          }
        };

        let errorMessageSent = false;
        /**
         * 失败也写入普通助手消息，保证错误进入事件流、搜索与导出。
         */
        const enqueueFailure = (error: { code: string; message: string }): void => {
          enqueueEvent(
            createNexusEvent({
              sessionId: parsed.data.sessionId,
              runId,
              seq: 1,
              type: 'run.failed',
              payload: { error }
            })
          );
          if (errorMessageSent) return;
          errorMessageSent = true;
          enqueueEvent(
            createNexusEvent({
              sessionId: parsed.data.sessionId,
              seq: 1,
              type: 'message.completed',
              payload: {
                messageId: `error-${randomUUID()}`,
                role: 'assistant',
                content:
                  error.code === 'RUN_MAX_STEPS'
                    ? error.message
                    : [error.message, error.code].filter(Boolean).join('\n\n'),
                error: true
              }
            })
          );
        };

        const rootPaths = sessions.listRoots(session.id).map((root) => root.path);
        const agentSettings = await loadAgentSettings();
        agentService
          .run(
            {
              ...parsed.data,
              maxSteps: parsed.data.maxSteps ?? agentSettings.maxSteps,
              rootPaths,
              mode: session.mode
            },
            provider,
            {
              runId,
              history: runHistory,
              signal: controller.signal,
              terminalOwnerId: senderId,
              autoApprove: async (call) => {
                const policy = sessions.get(session.id)?.approvalPolicy ?? 'ask';
                if (policy === 'always') return true;
                return (
                  policy === 'workspace' &&
                  (await canAutoApproveWorkspace(
                    call.name,
                    call.arguments,
                    sessions.listRoots(session.id)
                  ))
                );
              },
              approveTool: (_call, _tool, approvalId) =>
                approvalService.request(approvalId, runId, senderId),
              askUser: (requestId, _questions) =>
                askUserService.request(requestId, runId, senderId),
              requestWorkspace: async (call) => {
                if (sender.isDestroyed()) return undefined;
                const requestId = randomUUID();
                const suggestedPath = await workspacePathFromCall(call.name, call.input);
                if (!suggestedPath) return undefined;
                sender.send(IPC_CHANNELS.workspaceAuthorizationRequested, {
                  requestId,
                  sessionId: session.id,
                  suggestedPath,
                  toolName: call.name,
                  ...(call.id ? { toolCallId: call.id } : {})
                });
                try {
                  const path = await workspaceAuthService.request(
                    requestId,
                    runId,
                    senderId,
                    suggestedPath
                  );
                  if (!path) return undefined;
                  const roots = await sessions.addRoots(session.id, [path]);
                  if (!sender.isDestroyed()) {
                    sender.send(IPC_CHANNELS.sessionRootsChanged, session.id);
                  }
                  return roots.map((root) => root.path);
                } finally {
                  if (!sender.isDestroyed()) {
                    sender.send(IPC_CHANNELS.workspaceAuthorizationSettled, { requestId });
                  }
                }
              },
              onEvent: (agentEvent) => {
                if (
                  !titleGenerationStarted &&
                  (agentEvent.type === 'message.delta' ||
                    agentEvent.type === 'message.reasoning.delta' ||
                    agentEvent.type === 'tool.requested' ||
                    agentEvent.type === 'run.completed' ||
                    agentEvent.type === 'run.failed' ||
                    agentEvent.type === 'run.cancelled')
                ) {
                  startTitleGeneration();
                }
                if (
                  agentEvent.type === 'run.completed' ||
                  agentEvent.type === 'run.failed' ||
                  agentEvent.type === 'run.cancelled'
                ) {
                  terminalEventSent = true;
                }
                if (agentEvent.type === 'run.failed') {
                  const failure = agentEvent.payload as unknown as {
                    error: { code: string; message: string };
                  };
                  enqueueFailure(failure.error);
                  return;
                }
                enqueueEvent(agentEvent);
              }
            }
          )
          .then(() => undefined)
          .catch((error: unknown) => {
            console.error('Agent 运行失败', error);
            startTitleGeneration();
            if (!terminalEventSent) {
              terminalEventSent = true;
              enqueueFailure({
                code: 'AGENT_RUN_FAILED',
                message: error instanceof Error ? error.message : 'Agent 运行失败'
              });
            }
          })
          .finally(async () => {
            await eventChain;
            sender.removeListener('destroyed', onSenderDestroyed);
            controller.signal.removeEventListener('abort', onAbort);
            approvalService.cancelRun(runId);
            askUserService.cancelRun(runId);
            workspaceAuthService.cancelRun(runId);
            unregisterRun(runId);
          });

        return ok({ runId });
      } catch (error) {
        console.error('Agent 启动失败', error);
        return fail(
          'AGENT_START_FAILED',
          error instanceof Error ? error.message : 'Agent 启动失败'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.agentCancel,
    async (event, rawRunId: unknown): Promise<Result<AgentCancelResult>> => {
      if (typeof rawRunId !== 'string' || !rawRunId) {
        return fail('AGENT_INVALID_INPUT', 'runId 不合法');
      }

      const active = getRun(rawRunId);
      if (!active) return ok({ runId: rawRunId, cancelled: false });
      if (active.senderId !== event.sender.id) {
        return fail('AGENT_CANCEL_DENIED', '不能取消其他窗口发起的 Run');
      }

      cancelActiveRun(active);
      return ok({ runId: rawRunId, cancelled: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.agentCancelSession,
    async (event, rawSessionId: unknown): Promise<Result<AgentCancelResult>> => {
      if (typeof rawSessionId !== 'string' || !rawSessionId) {
        return fail('AGENT_INVALID_INPUT', '会话 ID 不合法');
      }
      const active = getRunForSession(rawSessionId);
      if (!active) return fail('AGENT_NOT_RUNNING', '会话没有运行中的 Run');
      if (active.senderId !== event.sender.id) {
        return fail('AGENT_CANCEL_DENIED', '不能取消其他窗口发起的 Run');
      }
      cancelActiveRun(active);
      return ok({ runId: active.runId, cancelled: true });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.agentAnswerUser,
    async (event, rawInput: unknown): Promise<Result<AskUserResolveResult>> => {
      const parsed = askUserResolveInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('ASK_USER_INVALID_INPUT', '回答参数不合法', parsed.error.flatten());
      }

      const resolved = askUserService.resolve(
        parsed.data.requestId,
        parsed.data.cancelled ? undefined : parsed.data.answers,
        event.sender.id
      );
      return ok({ requestId: parsed.data.requestId, resolved });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.approvalResolve,
    async (event, rawInput: unknown): Promise<Result<ApprovalResolveResult>> => {
      const parsed = approvalResolveInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('APPROVAL_INVALID_INPUT', '审批参数不合法', parsed.error.flatten());
      }

      const resolved = approvalService.resolve(
        parsed.data.approvalId,
        parsed.data.approved,
        event.sender.id
      );
      return ok({ approvalId: parsed.data.approvalId, resolved });
    }
  );
};
