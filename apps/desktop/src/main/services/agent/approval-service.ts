/**
 * 审批服务：主进程等待渲染进程对工具调用做出决定。
 */

interface PendingApproval {
  runId: string;
  senderId: number;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class ApprovalService {
  private readonly pending = new Map<string, PendingApproval>();

  /**
   * 发起审批并等待用户决定；超时按拒绝处理。
   */
  request(approvalId: string, runId: string, senderId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(approvalId);
        resolve(false);
      }, DEFAULT_TIMEOUT_MS);

      this.pending.set(approvalId, { runId, senderId, resolve, timer });
    });
  }

  /**
   * 处理用户决定；只允许发起 Run 的窗口操作。
   */
  resolve(approvalId: string, approved: boolean, senderId: number): boolean {
    const item = this.pending.get(approvalId);
    if (!item || item.senderId !== senderId) return false;

    clearTimeout(item.timer);
    this.pending.delete(approvalId);
    item.resolve(approved);
    return true;
  }

  /**
   * 查询某个 Run 是否仍有待处理审批；用于避免单个子代理审批结束时提前恢复状态。
   */
  hasPendingForRun(runId: string): boolean {
    for (const item of this.pending.values()) {
      if (item.runId === runId) return true;
    }
    return false;
  }

  /**
   * Run 取消或结束时拒绝所有待处理审批。
   */
  cancelRun(runId: string): void {
    for (const [approvalId, item] of this.pending) {
      if (item.runId !== runId) continue;
      clearTimeout(item.timer);
      this.pending.delete(approvalId);
      item.resolve(false);
    }
  }
}

/**
 * 主进程共享的审批队列。
 */
export const approvalService = new ApprovalService();
