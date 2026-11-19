/**
 * 工作区授权服务测试：验证路径绑定、拒绝、取消与超时清理。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceAuthService } from './workspace-auth-service';

describe('WorkspaceAuthService', () => {
  let service: WorkspaceAuthService;

  afterEach(() => {
    vi.useRealTimers();
    service = new WorkspaceAuthService();
  });

  it('uses the suggested path for an approved request', async () => {
    service = new WorkspaceAuthService();
    const pending = service.request('request-1', 'run-1', 1, '/tmp/project');
    expect(service.resolve('request-1', 'approved', 1)).toBe(true);
    await expect(pending).resolves.toBe('/tmp/project');
  });

  it('ignores requests from another renderer', async () => {
    service = new WorkspaceAuthService();
    const pending = service.request('request-2', 'run-1', 1, '/tmp/project');
    expect(service.resolve('request-2', 'approved', 2)).toBe(false);
    service.cancelRun('run-1');
    await expect(pending).resolves.toBeUndefined();
  });

  it('resolves pending requests when a run is cancelled', async () => {
    service = new WorkspaceAuthService();
    const pending = service.request('request-4', 'run-1', 1, '/tmp/project');
    service.cancelRun('run-1');
    await expect(pending).resolves.toBeUndefined();
  });

  it('times out without approving', async () => {
    vi.useFakeTimers();
    service = new WorkspaceAuthService();
    const pending = service.request('request-5', 'run-1', 1, '/tmp/project');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(pending).resolves.toBeUndefined();
  });
});
