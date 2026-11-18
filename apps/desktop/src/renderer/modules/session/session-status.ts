/**
 * 会话状态文案映射：侧栏、Tab 与快捷切换共用。
 */

import type { SessionStatus } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';

export const sessionStatusLabel = (status: SessionStatus): string => {
  switch (status) {
    case 'running':
      return t('session.status.running');
    case 'waiting_approval':
      return t('session.status.waiting_approval');
    case 'waiting_user':
      return t('session.status.waiting_user');
    case 'completed':
      return t('session.status.completed');
    case 'failed':
      return t('session.status.failed');
    case 'interrupted':
      return t('session.status.interrupted');
    case 'archived':
      return t('session.status.archived');
    default:
      return t('session.status.idle');
  }
};
