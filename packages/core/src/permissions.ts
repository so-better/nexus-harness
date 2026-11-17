/* 权限模型骨架：工具与扩展能力的最小权限校验。 */

export const PERMISSION_LEVELS = ['read', 'write', 'execute', 'network'] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/* 权限不足时抛出，调用方转换为结构化错误。 */
export class PermissionDeniedError extends Error {
  readonly level: PermissionLevel;

  constructor(level: PermissionLevel) {
    super(`缺少权限：${level}`);
    this.name = 'PermissionDeniedError';
    this.level = level;
  }
}

/* 当前运行时持有的权限集合；后续由审批与 scope 授权填充。 */
export class PermissionGateway {
  private readonly granted = new Set<PermissionLevel>();

  constructor(initial: readonly PermissionLevel[] = []) {
    for (const level of initial) this.granted.add(level);
  }

  /* 授予权限，重复授予保持幂等。 */
  grant(level: PermissionLevel): void {
    this.granted.add(level);
  }

  /* 撤销权限。 */
  revoke(level: PermissionLevel): void {
    this.granted.delete(level);
  }

  /* 查询是否拥有权限。 */
  has(level: PermissionLevel): boolean {
    return this.granted.has(level);
  }

  /* 断言权限存在，不存在时抛出 PermissionDeniedError。 */
  assert(level: PermissionLevel): void {
    if (!this.has(level)) throw new PermissionDeniedError(level);
  }

  /* 清空全部授权。 */
  clear(): void {
    this.granted.clear();
  }
}
