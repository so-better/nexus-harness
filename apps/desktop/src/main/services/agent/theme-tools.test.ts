// @vitest-environment node
/**
 * 主题工具：读取、切换、持久化与非法来源校验。
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  themeSource: 'system',
  windows: [
    {
      isDestroyed: () => false,
      setBackgroundColor: vi.fn(),
      webContents: { send: vi.fn() }
    }
  ]
}));

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => state.windows },
  nativeTheme: {
    get themeSource() {
      return state.themeSource;
    },
    set themeSource(value: string) {
      state.themeSource = value;
    },
    shouldUseDarkColors: false
  }
}));

import { executeThemeTool, themeToolDefinitions } from './theme-tools';

describe('theme tools', () => {
  let settingsDir = '';

  beforeEach(async () => {
    settingsDir = await mkdtemp(join(tmpdir(), 'nexus-theme-tools-'));
    state.themeSource = 'system';
  });

  afterEach(async () => {
    await rm(settingsDir, { recursive: true, force: true });
  });

  it('exposes read and approved update tools', () => {
    expect(themeToolDefinitions).toMatchObject([
      { name: 'theme_get', requiresApproval: false, permission: 'read' },
      { name: 'theme_update', requiresApproval: true, permission: 'write' }
    ]);
  });

  it('reads and switches theme with persistence', async () => {
    const initial = await executeThemeTool('theme_get', {}, { settingsDir });
    expect(initial.ok).toBe(true);
    expect(JSON.parse(initial.output)).toMatchObject({ source: 'system', effective: 'light' });

    const onChange = vi.fn();
    const updated = await executeThemeTool(
      'theme_update',
      { source: 'dark' },
      { settingsDir, onChange }
    );
    expect(updated.ok).toBe(true);
    expect(JSON.parse(updated.output)).toMatchObject({ source: 'dark', effective: 'light' });
    expect(onChange).toHaveBeenCalledWith({ source: 'dark', effective: 'light' });
    const saved = JSON.parse(await readFile(join(settingsDir, 'theme.json'), 'utf8')) as {
      source: string;
    };
    expect(saved.source).toBe('dark');
  });

  it('rejects unknown sources and empty input', async () => {
    const invalid = await executeThemeTool(
      'theme_update',
      { source: 'neon' },
      { settingsDir }
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'THEME_INVALID_INPUT' }
    });

    const empty = await executeThemeTool('theme_get', { extra: true }, { settingsDir });
    expect(empty).toMatchObject({
      ok: false,
      error: { code: 'THEME_INVALID_INPUT' }
    });
  });
});
