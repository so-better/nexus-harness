/**
 * 会话导出：从事件流生成脱敏 Markdown/HTML，供 PDF 复用。
 */

import type { NexusEvent } from '@shared/events';
import type { SessionSummary } from '@shared/ipc/contracts';

export type SessionExportFormat = 'markdown' | 'html' | 'pdf';

interface ExportBlock {
  role: 'user' | 'assistant' | 'tool' | 'system';
  label: string;
  text: string;
  ts: number;
}

const MAX_BLOCK_CHARS = 20_000;

/**
 * 对导出内容做基本脱敏，避免意外带出常见密钥。
 */
const redact = (value: string): string =>
  value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s"'`,]+/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"'`,]+/gi, '$1[REDACTED]');

const truncate = (value: string): string =>
  value.length > MAX_BLOCK_CHARS ? `${value.slice(0, MAX_BLOCK_CHARS)}\n…[已截断]` : value;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const collectUsage = (events: readonly NexusEvent[]): string => {
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  for (const event of events) {
    if (event.type !== 'usage.recorded') continue;
    const payload = event.payload as {
      inputTokens?: number;
      outputTokens?: number;
      cost?: number;
    };
    inputTokens += payload.inputTokens ?? 0;
    outputTokens += payload.outputTokens ?? 0;
    cost += payload.cost ?? 0;
  }
  return `输入 token：${inputTokens}\n输出 token：${outputTokens}\n费用：$${cost.toFixed(4)}`;
};

const collectBlocks = (events: readonly NexusEvent[]): ExportBlock[] => {
  const blocks: ExportBlock[] = [];
  const superseded = new Set(
    events
      .filter((event) => event.type === 'message.superseded')
      .map((event) => (event.payload as { messageId?: string }).messageId)
      .filter((id): id is string => Boolean(id))
  );
  for (const event of events) {
    if (event.type === 'message.completed') {
      const payload = event.payload as {
        messageId?: string;
        role?: string;
        content?: string;
        reasoning?: string;
        references?: Array<{ path?: string }>;
        images?: Array<{ path?: string }>;
      };
      if (
        (payload.role === 'user' || payload.role === 'assistant') &&
        typeof payload.content === 'string' &&
        (!payload.messageId || !superseded.has(payload.messageId))
      ) {
        const paths = [
          ...(payload.references ?? []).map((reference) => reference.path),
          ...(payload.images ?? []).map((image) => image.path)
        ].filter((path): path is string => Boolean(path));
        const text = [payload.content, ...paths.map((path) => `@${path}`)]
          .filter(Boolean)
          .join('\n');
        blocks.push({
          role: payload.role,
          label: payload.role === 'user' ? '用户' : 'Agent',
          text: redact(truncate(text)),
          ts: event.ts
        });
        if (payload.role === 'assistant' && payload.reasoning?.trim()) {
          blocks.push({
            role: 'assistant',
            label: '思考过程',
            text: redact(truncate(payload.reasoning)),
            ts: event.ts
          });
        }
      }
      continue;
    }
    if (event.type === 'tool.requested') {
      const payload = event.payload as { name?: string; input?: unknown };
      if (typeof payload.name !== 'string') continue;
      blocks.push({
        role: 'tool',
        label: `工具：${payload.name}`,
        text: redact(truncate(JSON.stringify(payload.input ?? {}, null, 2))),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'tool.completed') {
      const payload = event.payload as { output?: unknown };
      if (typeof payload.output !== 'string') continue;
      blocks.push({
        role: 'tool',
        label: '工具结果',
        text: redact(truncate(payload.output)),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'tool.failed') {
      const payload = event.payload as { error?: { code?: string; message?: string } };
      blocks.push({
        role: 'system',
        label: '工具失败',
        text: redact(
          truncate(`${payload.error?.code ?? 'TOOL_FAILED'}: ${payload.error?.message ?? ''}`)
        ),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'checkpoint.created') {
      const payload = event.payload as { label?: string; path?: string; checkpointId?: string };
      blocks.push({
        role: 'system',
        label: '检查点',
        text: redact(
          [payload.label ?? payload.checkpointId ?? 'checkpoint', payload.path]
            .filter(Boolean)
            .join(' · ')
        ),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'checkpoint.restored') {
      const payload = event.payload as { checkpointId?: string };
      blocks.push({
        role: 'system',
        label: '检查点恢复',
        text: redact(payload.checkpointId ?? 'checkpoint'),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'approval.requested') {
      const payload = event.payload as { scope?: string };
      blocks.push({
        role: 'system',
        label: '审批请求',
        text: redact(payload.scope ?? ''),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'approval.resolved') {
      const payload = event.payload as { decision?: string; reason?: string };
      blocks.push({
        role: 'system',
        label: '审批结果',
        text: redact(
          truncate(
            `${payload.decision ?? 'rejected'}${payload.reason ? ` · ${payload.reason}` : ''}`
          )
        ),
        ts: event.ts
      });
      continue;
    }
    if (event.type === 'file.created') {
      const payload = event.payload as {
        name?: string;
        mime?: string;
        bytes?: number;
        source?: string;
      };
      if (typeof payload.name !== 'string') continue;
      blocks.push({
        role: 'system',
        label: '文件',
        text: redact(
          `${payload.name}${payload.mime ? ` · ${payload.mime}` : ''}${payload.bytes ? ` · ${payload.bytes} bytes` : ''}${payload.source ? ` · ${payload.source}` : ''}`
        ),
        ts: event.ts
      });
      continue;
    }
  }
  return blocks;
};

const metadata = (session: SessionSummary, events: readonly NexusEvent[]): string =>
  `创建时间：${new Date(session.createdAt).toLocaleString()}\n更新时间：${new Date(session.updatedAt).toLocaleString()}\n模式：${session.mode === 'plan' ? 'Plan' : 'Build'}\n\n用量：\n${collectUsage(events)}`;

/**
 * 生成 Markdown 导出内容。
 */
export const buildSessionMarkdown = (
  session: SessionSummary,
  events: readonly NexusEvent[]
): string => {
  const blocks = collectBlocks(events);
  const body = blocks
    .map(
      (block) => `## ${block.label}\n\n_${new Date(block.ts).toLocaleString()}_\n\n${block.text}`
    )
    .join('\n\n---\n\n');
  return `# ${redact(session.title)}\n\n${metadata(session, events)}\n\n${body || '_没有可导出的消息_'}\n`;
};

/**
 * 生成自包含 HTML 导出内容。
 */
export const buildSessionHtml = (
  session: SessionSummary,
  events: readonly NexusEvent[]
): string => {
  const blocks = collectBlocks(events);
  const body = blocks
    .map(
      (block) => `<section class="block block--${block.role}">
  <header><strong>${escapeHtml(block.label)}</strong><time>${escapeHtml(new Date(block.ts).toLocaleString())}</time></header>
  <pre>${escapeHtml(block.text)}</pre>
</section>`
    )
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(session.title)}</title>
<style>
body{margin:40px auto;max-width:900px;padding:0 24px;color:#1f2937;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff}
h1{font-size:24px}.meta{color:#6b7280;white-space:pre-line;margin-bottom:28px}.block{margin:18px 0;border:1px solid #e5e7eb;border-radius:8px;padding:12px;break-inside:avoid}
.block header{display:flex;justify-content:space-between;color:#6b7280;font-size:12px}.block--user{border-color:#bfdbfe;background:#eff6ff}.block--tool{background:#f8fafc}.block--system{border-color:#fecaca;background:#fff7f7}
pre{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,SFMono-Regular,monospace}
</style></head><body><h1>${escapeHtml(session.title)}</h1><div class="meta">${escapeHtml(metadata(session, events))}</div>${body || '<p>没有可导出的消息</p>'}</body></html>`;
};
