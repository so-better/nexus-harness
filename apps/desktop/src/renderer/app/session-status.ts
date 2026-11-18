/**
 * 会话状态展示：顶栏 Tag 与侧栏状态共用同一套文案和语义色。
 */

import type { SessionStatus } from '@shared/ipc/contracts';
import { t } from './i18n';

export type SessionStatusTone = 'default' | 'info' | 'warning' | 'success' | 'error';

export interface SessionStatusTagColor {
  color: string;
  textColor: string;
  borderColor: string;
}

/**
 * 状态对应的语义色：default 空闲靛蓝、info 蓝、warning 橙、success 绿、error 红。
 */
export const sessionStatusTone = (status: SessionStatus | undefined): SessionStatusTone => {
  switch (status) {
    case 'running':
    case 'archived':
      return 'info';
    case 'waiting_approval':
    case 'waiting_user':
    case 'interrupted':
      return 'warning';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

/**
 * 状态文案；未知状态按空闲展示。
 */
export const sessionStatusLabel = (status: SessionStatus | undefined): string => {
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

const tagColors: Record<SessionStatusTone, SessionStatusTagColor> = {
  default: {
    color: 'color-mix(in srgb, var(--nh-color-idle) 12%, transparent)',
    textColor: 'var(--nh-color-idle)',
    borderColor: 'transparent'
  },
  info: {
    color: 'color-mix(in srgb, var(--nh-color-accent) 12%, transparent)',
    textColor: 'var(--nh-color-accent)',
    borderColor: 'transparent'
  },
  warning: {
    color: 'color-mix(in srgb, var(--nh-color-warning) 12%, transparent)',
    textColor: 'var(--nh-color-warning)',
    borderColor: 'transparent'
  },
  success: {
    color: 'color-mix(in srgb, var(--nh-color-success) 12%, transparent)',
    textColor: 'var(--nh-color-success)',
    borderColor: 'transparent'
  },
  error: {
    color: 'color-mix(in srgb, var(--nh-color-danger) 12%, transparent)',
    textColor: 'var(--nh-color-danger)',
    borderColor: 'transparent'
  }
};

/**
 * 状态 Tag 与侧栏共用语义色；空闲使用独立的低饱和靛蓝色。
 */
export const sessionStatusTagColor = (status: SessionStatus | undefined): SessionStatusTagColor =>
  tagColors[sessionStatusTone(status)];
