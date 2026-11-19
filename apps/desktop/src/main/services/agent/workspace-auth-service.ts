/**
 * 工作区授权服务：主进程等待渲染进程批准目录访问。
 */

interface PendingWorkspaceAuth {
  runId: string;
  senderId: number;
  suggestedPath: string;
  resolve: (path: string | undefined) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class WorkspaceAuthService {
  private readonly pending = new Map<string, PendingWorkspaceAuth>();

  /**
   * 创建授权请求；只允许使用请求中展示给用户的 suggestedPath。
   */
  request(
    requestId: string,
    runId: string,
    senderId: number,
    suggestedPath: string
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(undefined);
      }, DEFAULT_TIMEOUT_MS);
      this.pending.set(requestId, { runId, senderId, suggestedPath, resolve, timer });
    });
  }

  /**
   * 按用户决定结束请求；默认允许只使用请求中展示的路径。
   */
  resolve(requestId: string, decision: 'approved' | 'rejected', senderId: number): boolean {
    return this.settle(
      requestId,
      decision === 'approved' ? this.pending.get(requestId)?.suggestedPath : undefined,
      senderId
    );
  }

  cancelRun(runId: string): void {
    for (const [requestId, item] of this.pending) {
      if (item.runId !== runId) continue;
      clearTimeout(item.timer);
      this.pending.delete(requestId);
      item.resolve(undefined);
    }
  }

  private settle(requestId: string, path: string | undefined, senderId: number): boolean {
    const item = this.pending.get(requestId);
    if (!item || item.senderId !== senderId) return false;
    clearTimeout(item.timer);
    this.pending.delete(requestId);
    item.resolve(path);
    return true;
  }
}

export const workspaceAuthService = new WorkspaceAuthService();
