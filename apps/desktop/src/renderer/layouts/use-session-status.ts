/**
 * 会话状态同步：把聊天投影状态回写到侧栏，避免列表状态滞后。
 */

import { watch, type Ref } from 'vue';
import type { SessionStatus } from '@shared/ipc/contracts';
import type { ChatProjection } from '@/modules/chat/types';
import type { useSessionStore } from '@/modules/session/stores/session.store';

const statusMap: Record<string, SessionStatus> = {
  idle: 'idle',
  running: 'running',
  waiting_approval: 'waiting_approval',
  waiting_user: 'waiting_user',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'interrupted',
  interrupted: 'interrupted'
};

/**
 * 监听投影状态并更新当前会话的本地状态。
 */
export const useSessionStatusSync = (
  sessions: ReturnType<typeof useSessionStore>,
  projection: Ref<ChatProjection>,
  activeId: Ref<string | undefined>
): void => {
  watch(
    () => projection.value.status,
    (status) => {
      if (activeId.value) sessions.setLocalStatus(activeId.value, statusMap[status] ?? 'idle');
    }
  );
};
