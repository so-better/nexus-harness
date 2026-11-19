/**
 * 终端设置持久化测试：默认值、保存与无效文件回退。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/ipc/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTerminalSettings, saveTerminalSettings } from './terminal-settings';

describe('terminal settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-terminal-settings-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns defaults when no file exists', async () => {
    await expect(loadTerminalSettings(directory)).resolves.toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it('persists terminal settings', async () => {
    const saved = await saveTerminalSettings(
      { ...DEFAULT_TERMINAL_SETTINGS, fontSize: 16, copyOnSelect: true },
      directory
    );
    await expect(loadTerminalSettings(directory)).resolves.toEqual(saved);
  });

  it('falls back for invalid JSON', async () => {
    await writeFile(join(directory, 'terminal.json'), '{invalid', 'utf8');
    await expect(loadTerminalSettings(directory)).resolves.toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it('migrates legacy font settings to the 12px default', async () => {
    await writeFile(
      join(directory, 'terminal.json'),
      JSON.stringify({
        shell: null,
        fontFamily: 'Menlo',
        fontSize: 16,
        scrollback: 5000,
        copyOnSelect: false,
        webgl: true
      }),
      'utf8'
    );
    await expect(loadTerminalSettings(directory)).resolves.toMatchObject({ fontSize: 12 });
  });
});
