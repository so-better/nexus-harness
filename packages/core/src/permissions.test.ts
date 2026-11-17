/* 权限模型单元测试：授予、撤销与断言。 */

import { describe, expect, it } from 'vitest';
import { PermissionDeniedError, PermissionGateway } from './permissions';

describe('PermissionGateway', () => {
  it('grants and revokes permissions', () => {
    const gateway = new PermissionGateway(['read']);

    expect(gateway.has('read')).toBe(true);
    expect(gateway.has('write')).toBe(false);

    gateway.grant('write');
    expect(gateway.has('write')).toBe(true);

    gateway.revoke('write');
    expect(gateway.has('write')).toBe(false);
  });

  it('throws when the permission is missing', () => {
    const gateway = new PermissionGateway();

    expect(() => gateway.assert('execute')).toThrow(PermissionDeniedError);
  });
});
