/**
 * 工作区 API：在会话 roots 内检索文件引用。
 */

import { nexus } from '@/app/nexus-bridge';
import type {
  WorkspaceAuthorizationRequest,
  WorkspaceAuthorizationResolveInput,
  WorkspaceAuthorizationSettled,
  WorkspaceFileReference
} from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 搜索 roots 内文件；query 为空时返回较短路径的文件。
 */
export const searchWorkspaceFiles = async (
  sessionId: string,
  query: string
): Promise<WorkspaceFileReference[]> =>
  unwrap(await nexus.workspace.searchFiles({ sessionId, query, limit: 20 }));

/**
 * 订阅主进程发起的目录授权请求。
 */
export const onWorkspaceAuthorization = (
  handler: (request: WorkspaceAuthorizationRequest) => void
): (() => void) => nexus.workspace.onAuthorizationRequested(handler);

/**
 * 回应目录授权请求。
 */
export const resolveWorkspaceAuthorization = async (
  input: WorkspaceAuthorizationResolveInput
): Promise<boolean> => unwrap(await nexus.workspace.resolveAuthorization(input)).resolved;

/**
 * 订阅授权结束（允许、拒绝、超时、Run 取消），用于清理内联授权卡。
 */
export const onWorkspaceAuthorizationSettled = (
  handler: (settled: WorkspaceAuthorizationSettled) => void
): (() => void) => nexus.workspace.onAuthorizationSettled(handler);
