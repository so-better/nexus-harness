/**
 * 会话工作区 root：切换会话时的读取、目录授权与撤销。
 */
import { computed, ref } from 'vue';
import type { SessionRoot } from '@shared/ipc/contracts';
import {
  addSessionRoots,
  chooseRoot,
  getSessionRoots,
  removeSessionRoot
} from '@/modules/session/api/session.api';

export const useSessionRoots = (onError?: (message: string) => void) => {
  const roots = ref<SessionRoot[]>([]);
  const rootPaths = computed(() => roots.value.map((root) => root.path));

  const report = (reason: unknown): void => {
    onError?.(reason instanceof Error ? reason.message : String(reason));
  };

  const loadRoots = async (sessionId: string): Promise<void> => {
    try {
      roots.value = await getSessionRoots(sessionId);
    } catch (reason) {
      roots.value = [];
      report(reason);
    }
  };

  const addRoot = async (sessionId: string): Promise<'added' | 'cancelled' | 'failed'> => {
    try {
      const paths = await chooseRoot(roots.value[0]?.path);
      if (paths.length === 0) return 'cancelled';
      roots.value = await addSessionRoots(sessionId, [paths[0]!]);
      return 'added';
    } catch (reason) {
      report(reason);
      return 'failed';
    }
  };

  const removeRoot = async (sessionId: string, rootId: string): Promise<boolean> => {
    try {
      roots.value = await removeSessionRoot(sessionId, rootId);
      return true;
    } catch (reason) {
      report(reason);
      return false;
    }
  };

  return { roots, rootPaths, loadRoots, addRoot, removeRoot };
};
