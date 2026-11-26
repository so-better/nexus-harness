/**
 * 全局记忆 API：设置页和输入命令共用。
 */

import type { MemoryItem, MemorySettings, MemoryUpdateInput } from '@shared/memory';
import { unwrap } from './ipc';
import { nexus } from './nexus-bridge';

export const listMemories = async (): Promise<MemoryItem[]> => unwrap(await nexus.memory.list());

export const updateMemory = async (input: MemoryUpdateInput): Promise<MemoryItem> =>
  unwrap(await nexus.memory.update(input));

export const removeMemory = async (id: string): Promise<boolean> =>
  unwrap(await nexus.memory.remove(id)).removed;

export const getMemorySettings = async (): Promise<MemorySettings> =>
  unwrap(await nexus.memory.getSettings());

export const setMemorySettings = async (settings: MemorySettings): Promise<MemorySettings> =>
  unwrap(await nexus.memory.setSettings(settings));

export const subscribeMemoryChanges = (handler: () => void): (() => void) =>
  nexus.memory.onChanged(handler);

export const rebuildMemoryIndex = async (): Promise<boolean> =>
  unwrap(await nexus.memory.rebuildIndex()).rebuilt;

export const subscribeMemoryCandidateEvents = (handler: () => void): (() => void) =>
  nexus.agent.onEvent((event) => {
    if (event.type === 'memory.proposed') handler();
  });
