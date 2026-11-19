/**
 * 通知角标设置测试：默认红点与数字保存。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadNotificationBadge, saveNotificationBadge } from './notification-settings';

describe('notification badge settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-notification-settings-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to a dot', async () => {
    await expect(loadNotificationBadge(directory)).resolves.toBe('dot');
  });

  it('persists count mode', async () => {
    await saveNotificationBadge('count', directory);
    await expect(loadNotificationBadge(directory)).resolves.toBe('count');
  });
});
