/**
 * 语言偏好测试：默认中文、持久化英文与无效值回退。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLanguage, saveLanguage } from './language-settings';

describe('language settings', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-language-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('defaults to zh-CN', async () => {
    await expect(loadLanguage(directory)).resolves.toBe('zh-CN');
  });

  it('persists English', async () => {
    await saveLanguage('en-US', directory);
    await expect(loadLanguage(directory)).resolves.toBe('en-US');
  });

  it('falls back for invalid values', async () => {
    await writeFile(join(directory, 'language.json'), JSON.stringify({ language: 'fr-FR' }));
    await expect(loadLanguage(directory)).resolves.toBe('zh-CN');
  });
});
