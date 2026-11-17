/* 统一的跨进程返回结构，主进程与渲染进程共用。 */

/* 可序列化的错误信息，不包含堆栈。 */
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

/* 所有 IPC 调用返回 Result，避免直接抛出跨进程异常。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

/* 构造成功结果。 */
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

/* 构造失败结果；details 为空时不写入字段，兼容 exactOptionalPropertyTypes。 */
export const fail = (code: string, message: string, details?: unknown): Result<never> =>
  details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
