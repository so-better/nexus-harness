/**
 * 工作区 API：在会话 roots 内检索文件引用。
 */

import type { WorkspaceFileReference } from '@shared/ipc/contracts';
import { unwrap } from '@/app/ipc';

/**
 * 搜索 roots 内文件；query 为空时返回较短路径的文件。
 */
export const searchWorkspaceFiles = async (
  sessionId: string,
  query: string
): Promise<WorkspaceFileReference[]> =>
  unwrap(await window.nexus.workspace.searchFiles({ sessionId, query, limit: 20 }));
