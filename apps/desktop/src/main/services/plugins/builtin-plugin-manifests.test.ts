/**
 * 内置插件 manifest 契约：目录名、入口与皮肤贡献点必须与资源目录一致。
 */
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginsRoot = fileURLToPath(new URL('../../../../resources/plugins/', import.meta.url));

describe('built-in plugin manifests', () => {
  it('keeps every built-in plugin manifest and entry valid', async () => {
    const entries = await readdir(pluginsRoot, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());

    for (const directory of directories) {
      const root = join(pluginsRoot, directory.name);
      const manifestPath = join(root, 'plugin.json');
      await expect(access(manifestPath)).resolves.toBeUndefined();

      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        id?: unknown;
        renderer?: unknown;
        permissions?: unknown;
        contributes?: { skins?: unknown[]; views?: unknown[]; messageSlots?: unknown[] };
      };

      expect(manifest.id).toBe(directory.name);
      expect(typeof manifest.renderer).toBe('string');
      await expect(access(join(root, String(manifest.renderer)))).resolves.toBeUndefined();

      if (directory.name.startsWith('nexus.skin-')) {
        expect(manifest.permissions).toContain('ui.skin');
        expect(Array.isArray(manifest.contributes?.skins)).toBe(true);
        expect(manifest.contributes?.skins?.length).toBeGreaterThan(0);
      }
      if (manifest.contributes?.views?.length) {
        expect(manifest.permissions).toContain('ui.panel');
      }
      if (manifest.contributes?.messageSlots?.length) {
        expect(manifest.permissions).toContain('ui.slot');
      }
    }
  });
});
