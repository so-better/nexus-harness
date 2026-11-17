/* 审批服务测试：窗口隔离与 Run 取消。 */

import { describe, expect, it } from 'vitest';
import { ApprovalService } from './approval-service';

describe('ApprovalService', () => {
  it('only lets the requesting window resolve', async () => {
    const service = new ApprovalService();
    const pending = service.request('approval-1', 'run-1', 1);

    expect(service.resolve('approval-1', true, 2)).toBe(false);
    expect(service.resolve('approval-1', true, 1)).toBe(true);
    await expect(pending).resolves.toBe(true);
  });

  it('rejects pending approvals when a run is cancelled', async () => {
    const service = new ApprovalService();
    const pending = service.request('approval-1', 'run-1', 1);

    service.cancelRun('run-1');
    await expect(pending).resolves.toBe(false);
  });
});
