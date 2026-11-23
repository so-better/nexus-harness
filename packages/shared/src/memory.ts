/**
 * 全局记忆契约：用户长期偏好、事实与决策；不按会话或工作区隔离。
 */

import { z } from 'zod';

export const memoryKindSchema = z.enum(['preference', 'fact', 'decision', 'context']);
export const memoryStatusSchema = z.enum(['proposed', 'active']);

export const memoryItemSchema = z.object({
  id: z.string().min(1),
  kind: memoryKindSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  status: memoryStatusSchema,
  priority: z.number().int(),
  sourceSessionId: z.string().optional(),
  sourceSessionTitle: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  lastUsedAt: z.number().int().optional()
});

export const memoryCreateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    content: z.string().trim().min(1).max(4_000),
    kind: memoryKindSchema,
    priority: z.number().int().min(0).max(100).optional(),
    sourceSessionId: z.string().min(1).optional()
  })
  .strict();

export const memoryUpdateInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().min(1).max(4_000).optional(),
    kind: memoryKindSchema.optional(),
    status: memoryStatusSchema.optional(),
    priority: z.number().int().min(0).max(100).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.content !== undefined ||
      value.kind !== undefined ||
      value.status !== undefined ||
      value.priority !== undefined,
    { message: '至少需要修改一个字段' }
  );

export const memoryIdInputSchema = z.object({ id: z.string().min(1) }).strict();

export const memoryReadInputSchema = z.object({ id: z.string().min(1) }).strict();

export const memorySearchInputSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(20).optional()
  })
  .strict();

export const memorySettingsSchema = z.object({
  autoCapture: z.boolean(),
  retrieval: z.boolean()
});

export type MemorySettings = z.infer<typeof memorySettingsSchema>;
export type MemorySearchInput = z.infer<typeof memorySearchInputSchema>;
export type MemoryReadInput = z.infer<typeof memoryReadInputSchema>;

/**
 * 粗粒度识别明显密钥/密码，避免把它们写进全局记忆。
 */
export const memoryLooksSensitive = (text: string): boolean =>
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\b(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{8,}/i
  ].some((pattern) => pattern.test(text));

export type MemoryKind = z.infer<typeof memoryKindSchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type MemoryItem = z.infer<typeof memoryItemSchema>;
export type MemoryCreateInput = z.infer<typeof memoryCreateInputSchema>;
export type MemoryUpdateInput = z.infer<typeof memoryUpdateInputSchema>;
