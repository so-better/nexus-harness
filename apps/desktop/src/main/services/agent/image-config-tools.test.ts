/**
 * 生图配置工具：敏感字段读取脱敏、写入拒绝原始 Key、保留用户已保存 Key。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  executeImageConfigTool,
  maskSecret,
  sanitizeImageConfigInput
} from './image-config-tools';

describe('image config tools', () => {
  let settingsDir = '';

  beforeEach(async () => {
    settingsDir = await mkdtemp(join(tmpdir(), 'nexus-image-config-'));
  });

  afterEach(async () => {
    await rm(settingsDir, { recursive: true, force: true });
  });

  it('masks existing keys and never returns raw secrets', async () => {
    await writeFile(
      join(settingsDir, 'image.json'),
      JSON.stringify({
        configs: [
          {
            id: 'image-1',
            name: 'Secret image',
            model: 'image-model',
            apiKey: 'sk-1234567890abcd',
            enabled: true,
            template: {
              url: 'https://example.com/generate',
              headers: { Authorization: 'Bearer sk-1234567890abcd' },
              body: { api_key: '{{api_key}}' }
            }
          }
        ]
      }),
      'utf8'
    );

    const result = await executeImageConfigTool('image_config_get', { id: 'image-1' }, settingsDir);
    expect(result.ok).toBe(true);
    expect(result.output).not.toContain('sk-1234567890abcd');
    expect(JSON.parse(result.output)).toMatchObject({
      hasApiKey: true,
      apiKey: maskSecret('sk-1234567890abcd')
    });
  });

  it('rejects raw secrets in a template but accepts placeholders', async () => {
    const rejected = await executeImageConfigTool(
      'image_config_save',
      {
        name: 'Bad',
        model: 'image-model',
        template: { url: 'https://example.com', body: { api_key: 'sk-raw-secret-1234' } }
      },
      settingsDir
    );
    expect(rejected).toMatchObject({
      ok: false,
      error: { code: 'IMAGE_CONFIG_SECRET_REJECTED' }
    });

    const accepted = await executeImageConfigTool(
      'image_config_save',
      {
        name: 'Good',
        model: 'image-model',
        template: {
          url: 'https://example.com',
          headers: { Authorization: 'Bearer {{api_key}}' },
          body: { api_key: '{{api_key}}' }
        }
      },
      settingsDir
    );
    expect(accepted.ok).toBe(true);
    expect(JSON.parse(accepted.output)).toMatchObject({ needsApiKey: true });
  });

  it('preserves the existing key when updating non-secret fields', async () => {
    const created = await executeImageConfigTool(
      'image_config_save',
      { name: 'Image', model: 'image-model', template: { url: 'https://example.com' } },
      settingsDir
    );
    expect(created.ok).toBe(true);
    const id = JSON.parse(created.output).config.id as string;
    const stored = JSON.parse(await readFile(join(settingsDir, 'image.json'), 'utf8')) as {
      configs: Array<{ apiKey?: string }>;
    };
    stored.configs[0]!.apiKey = 'sk-user-entered-1234';
    await writeFile(join(settingsDir, 'image.json'), JSON.stringify(stored), 'utf8');

    const updated = await executeImageConfigTool(
      'image_config_save',
      { id, name: 'Renamed', model: 'image-model', template: { url: 'https://example.com' } },
      settingsDir
    );
    expect(updated.ok).toBe(true);
    expect(await readFile(join(settingsDir, 'image.json'), 'utf8')).toContain(
      'sk-user-entered-1234'
    );
  });

  it('preserves user-entered headers when an update omits headers', async () => {
    const created = await executeImageConfigTool(
      'image_config_save',
      {
        name: 'Header config',
        model: 'header-model',
        template: { url: 'https://example.com', headers: { 'X-Trace': 'trace-value' } }
      },
      settingsDir
    );
    expect(created.ok).toBe(true);
    const id = JSON.parse(created.output).config.id as string;
    const stored = JSON.parse(await readFile(join(settingsDir, 'image.json'), 'utf8')) as {
      configs: Array<{ template: { headers?: Record<string, string> } }>;
    };
    stored.configs[0]!.template.headers = { Authorization: 'Bearer sk-user-secret' };
    await writeFile(join(settingsDir, 'image.json'), JSON.stringify(stored), 'utf8');

    const updated = await executeImageConfigTool(
      'image_config_save',
      { id, name: 'Header config', model: 'header-model', template: { url: 'https://example.com/changed' } },
      settingsDir
    );
    expect(updated.ok).toBe(true);
    expect(await readFile(join(settingsDir, 'image.json'), 'utf8')).toContain(
      'Bearer sk-user-secret'
    );
  });

  it('rejects URL credentials and raw query secrets', async () => {
    const credentials = await executeImageConfigTool(
      'image_config_save',
      {
        name: 'Credential URL',
        model: 'image-model',
        template: { url: 'https://user:password@example.com' }
      },
      settingsDir
    );
    expect(credentials).toMatchObject({
      ok: false,
      error: { code: 'IMAGE_CONFIG_SECRET_REJECTED' }
    });

    const querySecret = await executeImageConfigTool(
      'image_config_save',
      {
        name: 'Query secret',
        model: 'image-model',
        template: { url: 'https://example.com?api_key=sk-raw-secret' }
      },
      settingsDir
    );
    expect(querySecret).toMatchObject({
      ok: false,
      error: { code: 'IMAGE_CONFIG_SECRET_REJECTED' }
    });
  });

  it('deletes a config by id, name, or model', async () => {
    const created = await executeImageConfigTool(
      'image_config_save',
      { name: 'Delete me', model: 'delete-me-image', template: { url: 'https://example.com' } },
      settingsDir
    );
    expect(created.ok).toBe(true);

    const deleted = await executeImageConfigTool(
      'image_config_delete',
      { name: 'Delete me' },
      settingsDir
    );
    expect(deleted.ok).toBe(true);
    expect(JSON.parse(deleted.output)).toMatchObject({ name: 'Delete me' });
  });

  it('redacts raw input before it is written to event payloads', () => {
    const raw = 'sk-raw-secret-1234';
    const sanitized = sanitizeImageConfigInput('image_config_save', {
      template: { body: { api_key: raw } }
    });
    expect(JSON.stringify(sanitized)).not.toContain(raw);
  });
});
