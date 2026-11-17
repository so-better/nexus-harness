/* 领域事件契约：事件类型、payload schema 与统一信封。 */

import { z } from 'zod';

/* 事件 payload 映射；新增事件时先在此登记，再实现发布与订阅。 */
export const eventPayloadSchemas = {
  'session.created': z.object({
    workspaceId: z.string().optional(),
    title: z.string().optional()
  }),
  'session.mode.changed': z.object({
    mode: z.enum(['plan', 'build'])
  }),
  'session.renamed': z.object({
    title: z.string(),
    source: z.enum(['auto', 'user'])
  }),
  'session.pinned': z.object({}),
  'session.removed': z.object({}),
  'session.unpinned': z.object({}),
  'run.started': z.object({
    model: z.string()
  }),
  'run.completed': z.object({
    durationMs: z.number().nonnegative()
  }),
  'run.failed': z.object({
    error: z.object({ code: z.string(), message: z.string() })
  }),
  'run.cancelled': z.object({
    reason: z.string().optional()
  }),
  'run.interrupted': z.object({
    reason: z.string()
  }),
  'message.completed': z.object({
    messageId: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string()
  }),
  'message.edited': z.object({
    messageId: z.string(),
    content: z.string()
  }),
  'message.regenerated': z.object({
    messageId: z.string(),
    sourceMessageId: z.string()
  }),
  'message.superseded': z.object({
    messageId: z.string(),
    reason: z.string()
  }),
  'tool.requested': z.object({
    toolCallId: z.string(),
    name: z.string(),
    input: z.unknown()
  }),
  'tool.completed': z.object({
    toolCallId: z.string(),
    ok: z.boolean(),
    output: z.string().optional()
  }),
  'tool.failed': z.object({
    toolCallId: z.string(),
    error: z.object({ code: z.string(), message: z.string() })
  }),
  'checkpoint.created': z.object({
    checkpointId: z.string(),
    label: z.string()
  }),
  'checkpoint.restored': z.object({
    checkpointId: z.string()
  }),
  'approval.requested': z.object({
    approvalId: z.string(),
    toolCallId: z.string(),
    scope: z.string()
  }),
  'approval.resolved': z.object({
    approvalId: z.string(),
    decision: z.enum(['approved', 'rejected', 'expired']),
    reason: z.string().optional()
  }),
  'usage.recorded': z.object({
    provider: z.string(),
    model: z.string(),
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    cost: z.number().nonnegative().optional()
  }),
  'file.created': z.object({
    fileId: z.string(),
    name: z.string(),
    mime: z.string(),
    bytes: z.number().nonnegative(),
    source: z.enum(['generated', 'downloaded'])
  }),
  'context.compacted': z.object({
    beforeTokens: z.number().nonnegative(),
    afterTokens: z.number().nonnegative(),
    strategy: z.string()
  }),
  'settings.updated': z.object({
    key: z.string(),
    scope: z.enum(['app', 'workspace', 'session'])
  })
} as const;

/* 所有领域事件类型。 */
export type NexusEventType = keyof typeof eventPayloadSchemas;

/* 事件类型到 payload 的映射。 */
export type EventPayloadMap = {
  [K in NexusEventType]: z.infer<(typeof eventPayloadSchemas)[K]>;
};

/* 统一事件信封；payload 由 type 决定。 */
export interface NexusEvent<T extends NexusEventType = NexusEventType> {
  id: string;
  sessionId: string;
  runId?: string;
  seq: number;
  type: T;
  version: number;
  ts: number;
  payload: EventPayloadMap[T];
  persisted?: boolean;
}

/* 事件信封的基础 zod schema；payload 由具体事件 schema 再校验。 */
export const nexusEventEnvelopeSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  runId: z.string().optional(),
  seq: z.number().int().nonnegative(),
  type: z.string(),
  version: z.number().int().positive(),
  ts: z.number().int().nonnegative(),
  payload: z.unknown()
});
