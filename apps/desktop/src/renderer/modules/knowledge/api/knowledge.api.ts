/**
 * 知识库 API：来源管理、检索与变更订阅。
 */

import { nexus } from '@/app/nexus-bridge';
import { unwrap } from '@/app/ipc';
import type {
  KnowledgeDirectoryImportInput,
  KnowledgeDirectoryScan,
  KnowledgeImportResult,
  KnowledgeSource
} from '@shared/knowledge';

export const listKnowledge = async (): Promise<KnowledgeSource[]> =>
  unwrap(await nexus.knowledge.list());

export const importKnowledgeFiles = async (): Promise<KnowledgeImportResult | null> =>
  unwrap(await nexus.knowledge.importFiles());

export const scanKnowledgeDirectory = async (): Promise<KnowledgeDirectoryScan | null> =>
  unwrap(await nexus.knowledge.scanDirectory());

export const importKnowledgeDirectory = async (
  input: KnowledgeDirectoryImportInput
): Promise<KnowledgeImportResult | null> => unwrap(await nexus.knowledge.importDirectory(input));

export const removeKnowledge = async (id: string): Promise<boolean> =>
  unwrap(await nexus.knowledge.remove(id)).removed;

export const reindexKnowledge = async (id: string): Promise<KnowledgeSource> =>
  unwrap(await nexus.knowledge.reindex(id));

export const openKnowledgeSource = async (id: string): Promise<boolean> =>
  unwrap(await nexus.knowledge.openSource(id)).opened;

export const onKnowledgeChanged = (handler: () => void): (() => void) =>
  nexus.knowledge.onChanged(handler);
