/**
 * 聊天 API：事件、Provider 列表、目录选择与 Agent 运行。
 */

import { nexus } from '@/app/nexus-bridge';
import type { MessageFileReference, NexusEvent } from '@shared/events';
import type { AskUserResolveInput, AskUserResolveResult } from '@shared/ask-user';
import type { AgentCancelResult, AgentStartResult, ProviderPublic } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 读取会话事件。
 */
export const loadEvents = async (sessionId: string): Promise<NexusEvent[]> =>
  unwrap(await nexus.session.events(sessionId));

/**
 * 读取可用模型提供商。
 */
export const listProviders = async (): Promise<ProviderPublic[]> =>
  unwrap(await nexus.provider.list());

/**
 * 启动 Agent Run。
 */
export const runAgent = async (input: {
  sessionId: string;
  prompt: string;
  rootPaths: string[];
  providerId: string;
  modelId: string;
  editMessageId?: string;
  regenerateMessageId?: string;
  imagePaths?: string[];
  references?: MessageFileReference[];
}): Promise<AgentStartResult> => unwrap(await nexus.agent.run(input));

/**
 * 取消 Run。
 */
export const cancelAgent = async (runId: string): Promise<AgentCancelResult> =>
  unwrap(await nexus.agent.cancel(runId));

/**
 * 按会话取消 Run；即使渲染层尚未拿到 runId 也能停止。
 */
export const cancelAgentSession = async (sessionId: string): Promise<AgentCancelResult> =>
  unwrap(await nexus.agent.cancelSession(sessionId));

/**
 * 解决审批。
 */
export const resolveApproval = async (
  approvalId: string,
  approved: boolean
): Promise<{ approvalId: string; resolved: boolean }> =>
  unwrap(await nexus.approval.resolve({ approvalId, approved }));

/**
 * 订阅 Agent 事件。
 */
export const subscribeAgentEvents = (handler: (event: NexusEvent) => void): (() => void) =>
  nexus.agent.onEvent(handler);

/**
 * 回答 Agent 的结构化提问。
 */
export const answerAskUser = async (input: AskUserResolveInput): Promise<AskUserResolveResult> =>
  unwrap(await nexus.agent.answerUser(input));
