/* Agent IPC：异步启动 Run、持久化事件、转发事件并支持按窗口取消。 */

import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import { createNexusEvent } from '@nexus/core';
import type { NexusEvent } from '@shared/events';
import { IPC_CHANNELS } from '@shared/ipc/channels';
import {
  agentRunInputSchema,
  approvalResolveInputSchema,
  type AgentCancelResult,
  type AgentStartResult,
  type ApprovalResolveResult
} from '@shared/ipc/contracts';
import { fail, ok, type Result } from '@shared/ipc/result';
import { AgentService } from '../services/agent/agent-service';
import { approvalService } from '../services/agent/approval-service';
import { providerStore } from '../services/provider/provider-store';
import { getDatabase } from '../services/storage/database';
import { EventStore } from '../services/session/event-store';
import { RunStore } from '../services/session/run-store';
import { SessionService } from '../services/session/session-service';
import {
  getRun,
  hasRunForSession,
  registerRun,
  unregisterRun
} from '../services/agent/run-registry';

const agentService = new AgentService();

/* 注册 agent:run 与 agent:cancel；事件只回传给发起窗口。 */
export const registerAgentIpc = (): void => {
  const db = getDatabase();
  const events = new EventStore(db);
  const sessions = new SessionService(db, events);
  const runs = new RunStore(db);

  ipcMain.handle(
    IPC_CHANNELS.agentRun,
    async (event, rawInput: unknown): Promise<Result<AgentStartResult>> => {
      const parsed = agentRunInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail('AGENT_INVALID_INPUT', 'Agent 运行参数不合法', parsed.error.flatten());
      }

      try {
        if (!sessions.get(parsed.data.sessionId)) {
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

        const runId = randomUUID();
        const controller = new AbortController();
        const sender = event.sender;
        const senderId = sender.id;
        const onSenderDestroyed = (): void => {
          approvalService.cancelRun(runId);
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

        let persistChain: Promise<void> = Promise.resolve();
        let terminalEventSent = false;

        const sendEvent = (payload: NexusEvent): void => {
          try {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.agentEvent, payload);
          } catch (error) {
            console.error('Agent 事件推送失败', error);
          }
        };

        /* 先落库再推送；失败时仍推送原事件，避免 UI 卡住。 */
        const enqueueEvent = (agentEvent: NexusEvent): void => {
          persistChain = persistChain.then(() => {
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
            sessions.setStatus(parsed.data.sessionId, 'idle');
          } else if (agentEvent.type === 'approval.requested') {
            runs.updateStatus(runId, 'waiting_approval');
            sessions.setStatus(parsed.data.sessionId, 'waiting_approval');
          } else if (agentEvent.type === 'approval.resolved') {
            runs.updateStatus(runId, 'running');
            sessions.setStatus(parsed.data.sessionId, 'running');
          }
        };

        agentService
          .run(parsed.data, provider, {
            runId,
            signal: controller.signal,
            approveTool: (_call, _tool, approvalId) => {
              return approvalService.request(approvalId, runId, senderId);
            },
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
            await persistChain;
            sender.removeListener('destroyed', onSenderDestroyed);
            approvalService.cancelRun(runId);
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
      active.controller.abort();
      return ok({ runId: rawRunId, cancelled: true });
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
