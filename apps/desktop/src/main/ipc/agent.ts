/**
 * Agent IPC：异步启动 Run、持久化事件、转发事件并支持按窗口取消。
 */

import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain } from 'electron';
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
import { approvalService } from '../services/agent/approval-service';
import { askUserService } from '../services/agent/ask-user-service';
import { providerStore } from '../services/provider/provider-store';
import { getDatabase } from '../services/storage/database';
import { EventStore } from '../services/session/event-store';
import { RunStore } from '../services/session/run-store';
import { SessionService } from '../services/session/session-service';
import { generateSessionTitle } from '../services/session/session-title';
import { SessionHistoryService } from '../services/session/session-history';
import {
  getRun,
  hasRunForSession,
  registerRun,
  unregisterRun
} from '../services/agent/run-registry';

/**
 * 注册 agent:run 与 agent:cancel；事件只回传给发起窗口。
 */
export const registerAgentIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);
  const runs = new RunStore(db);
  const history = new SessionHistoryService(events);
  const agentService = new AgentService({ database: db });

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
        if (!provider.models.some((model) => model.id === parsed.data.modelId)) {
          return fail('PROVIDER_MODEL_NOT_FOUND', `模型不存在：${parsed.data.modelId}`);
        }

        if (parsed.data.editMessageId && parsed.data.regenerateMessageId) {
          return fail('AGENT_INVALID_INPUT', '不能同时编辑和重新生成');
        }

        let runHistory = history.load(session.id);
        const branchMessageId = parsed.data.editMessageId ?? parsed.data.regenerateMessageId;
        if (branchMessageId) {
          const allEvents = events.list(session.id);
          const boundary = allEvents.findIndex(
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
          if (parsed.data.regenerateMessageId && role !== 'assistant') {
            return fail('SESSION_MESSAGE_INVALID', '只能重新生成助手消息');
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
                  ...(parsed.data.references?.length ? { references: parsed.data.references } : {})
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
                  messageId: branchMessageId,
                  sourceMessageId:
                    sourceMessageId?.type === 'message.completed'
                      ? (sourceMessageId.payload as { messageId: string }).messageId
                      : branchMessageId
                }
              })
            );
          }

          const supersededIds = allEvents
            .slice(boundary)
            .filter((item) => item.type === 'message.completed')
            .map((item) => (item.payload as { messageId: string }).messageId);
          for (const messageId of supersededIds) {
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

        if (session.titleSource === 'auto' && session.title === '新会话') {
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
        }

        const runId = randomUUID();
        const controller = new AbortController();
        const sender = event.sender;
        const senderId = sender.id;
        const onSenderDestroyed = (): void => {
          approvalService.cancelRun(runId);
          askUserService.cancelRun(runId);
          controller.abort();
        };
        sender.once('destroyed', onSenderDestroyed);
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

        const rootPaths = sessions.listRoots(session.id).map((root) => root.path);
        agentService
          .run({ ...parsed.data, rootPaths, mode: session.mode }, provider, {
            runId,
            history: runHistory,
            signal: controller.signal,
            approveTool: (_call, _tool, approvalId) => {
              return approvalService.request(approvalId, runId, senderId);
            },
            askUser: (requestId, _questions) => askUserService.request(requestId, runId, senderId),
            onEvent: (agentEvent) => {
              if (
                agentEvent.type === 'run.completed' ||
                agentEvent.type === 'run.failed' ||
                agentEvent.type === 'run.cancelled'
              ) {
                terminalEventSent = true;
              }
              enqueueEvent(agentEvent);
            }
          })
          .then(() => undefined)
          .catch((error: unknown) => {
            console.error('Agent 运行失败', error);
            if (!terminalEventSent) {
              terminalEventSent = true;
              enqueueEvent(
                createNexusEvent({
                  sessionId: parsed.data.sessionId,
                  runId,
                  seq: 1,
                  type: 'run.failed',
                  payload: {
                    error: {
                      code: 'AGENT_RUN_FAILED',
                      message: error instanceof Error ? error.message : 'Agent 运行失败'
                    }
                  }
                })
              );
            }
          })
          .finally(async () => {
            await eventChain;
            sender.removeListener('destroyed', onSenderDestroyed);
            approvalService.cancelRun(runId);
            askUserService.cancelRun(runId);
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

      approvalService.cancelRun(rawRunId);
      askUserService.cancelRun(rawRunId);
      active.controller.abort();
      return ok({ runId: rawRunId, cancelled: true });
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
