// @vitest-environment node
/**
 * 通用设置工具：读取、语言/角标/自启更新与状态广播。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, setLoginItemSettings: vi.fn(), dock: undefined },
  BrowserWindow: class {},
  Notification: class {}
}));

import { executeGeneralSettingsTool } from './general-settings-tools';

describe('general settings tools', () => {
  let settingsDir = '';

  beforeEach(async () => {
    settingsDir = await mkdtemp(join(tmpdir(), 'nexus-general-tools-'));
  });

  afterEach(async () => {
    await rm(settingsDir, { recursive: true, force: true });
  });

  it('reads defaults and updates language, auto launch and badge', async () => {
    const initial = await executeGeneralSettingsTool('general_settings_get', {}, { settingsDir });
    expect(initial.ok).toBe(true);
    expect(JSON.parse(initial.output)).toMatchObject({
      language: 'zh-CN',
      autoLaunch: true,
      notificationBadge: 'dot'
    });

    const onChange = vi.fn();
    const updated = await executeGeneralSettingsTool(
      'general_settings_update',
      { language: 'en-US', autoLaunch: false, notificationBadge: 'count' },
      { settingsDir, onChange }
    );
    expect(updated.ok).toBe(true);
    expect(JSON.parse(updated.output)).toMatchObject({
      language: 'en-US',
      autoLaunch: false,
      notificationBadge: 'count'
    });
    expect(onChange).toHaveBeenCalledWith({
      language: 'en-US',
      autoLaunch: false,
      notificationBadge: 'count'
    });
  });

  it('rejects empty or invalid updates', async () => {
    const empty = await executeGeneralSettingsTool('general_settings_update', {}, { settingsDir });
    expect(empty).toMatchObject({
      ok: false,
      error: { code: 'GENERAL_SETTINGS_INVALID_INPUT' }
    });

    const invalid = await executeGeneralSettingsTool(
      'general_settings_update',
      { language: 'fr-FR' },
      { settingsDir }
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'GENERAL_SETTINGS_INVALID_INPUT' }
    });
  });
});
