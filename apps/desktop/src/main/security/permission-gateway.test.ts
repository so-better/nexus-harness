/**
 * 主进程权限网关单元测试：scope 隔离与断言。
 */

import { PermissionDeniedError } from '@nexus/core';
import { describe, expect, it } from 'vitest';
import { PermissionGateway } from './permission-gateway';

describe('PermissionGateway', () => {
  it('isolates grants by scope', () => {
    const gateway = new PermissionGateway();
    gateway.grant('write', 'session-1');

    expect(gateway.has('write', 'session-1')).toBe(true);
    expect(gateway.has('write', 'session-2')).toBe(false);
  });

  it('throws when the scoped permission is missing', () => {
    const gateway = new PermissionGateway();

    expect(() => gateway.assert('execute', 'session-1')).toThrow(PermissionDeniedError);
  });
});
