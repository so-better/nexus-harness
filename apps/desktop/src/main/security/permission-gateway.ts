/* 主进程权限网关：按 scope 组合 core 的权限策略，审批执行层后续接入。 */

import { PermissionGateway as CorePermissionGateway, type PermissionLevel } from '@nexus/core';

const APP_SCOPE = 'app';

/* 以 scope 管理 core 权限集合；scope 可为 app、workspace 或 session id。 */
export class PermissionGateway {
  private readonly scopes = new Map<string, CorePermissionGateway>();

  /* 读取或创建某个 scope 的权限集合。 */
  private scope(name: string): CorePermissionGateway {
    let gateway = this.scopes.get(name);
    if (!gateway) {
      gateway = new CorePermissionGateway();
      this.scopes.set(name, gateway);
    }
    return gateway;
  }

  /* 授权某个 scope 下的权限。 */
  grant(level: PermissionLevel, scope = APP_SCOPE): void {
    this.scope(scope).grant(level);
  }

  /* 撤销某个 scope 下的权限。 */
  revoke(level: PermissionLevel, scope = APP_SCOPE): void {
    this.scope(scope).revoke(level);
  }

  /* 查询某个 scope 是否拥有权限。 */
  has(level: PermissionLevel, scope = APP_SCOPE): boolean {
    return this.scope(scope).has(level);
  }

  /* 断言权限存在，缺失时抛出 core 的 PermissionDeniedError。 */
  assert(level: PermissionLevel, scope = APP_SCOPE): void {
    this.scope(scope).assert(level);
  }

  /* 清空全部 scope 授权。 */
  clear(): void {
    this.scopes.clear();
  }
}
