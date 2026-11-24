/**
 * 知识库：本地来源、切分片段与检索结果的跨进程契约。
 */

import { z } from 'zod';

export type KnowledgeSourceKind = 'file';
export type KnowledgeSourceStatus = 'ready' | 'error';

export interface KnowledgeSource {
  id: string;
  name: string;
  kind: KnowledgeSourceKind;
  originPath?: string;
  mime?: string;
  bytes: number;
  chunkCount: number;
  status: KnowledgeSourceStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeSearchHit {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  originPath?: string;
  heading?: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
}

export interface KnowledgeImportResult {
  sources: KnowledgeSource[];
  errors: string[];
}

export interface KnowledgeDirectoryScan {
  token: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  skipped: number;
  errors: string[];
}

export const knowledgeIdInputSchema = z.object({
  id: z.string().trim().min(1)
});

export const knowledgeDirectoryImportInputSchema = z.object({
  token: z.string().trim().min(1)
});

export type KnowledgeDirectoryImportInput = z.infer<typeof knowledgeDirectoryImportInputSchema>;

export const knowledgeSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional()
});

export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchInputSchema>;
