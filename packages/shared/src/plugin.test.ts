/**
 * 插件 manifest 契约测试：聚焦 navigation 自定义图标资源字段 iconAsset 的校验。
 */

import { describe, expect, it } from 'vitest';
import { pluginManifestSchema } from './plugin';

const makeManifest = (navigation: unknown) => ({
  id: 'nexus.demo',
  name: 'Demo',
  version: '1.0.0',
  engines: { nexus: '>=0.0.1 <0.1.0' },
  contributes: {
    views: [{ id: 'v', title: 'V' }],
    navigation
  }
});

describe('pluginManifestSchema navigation iconAsset', () => {
  it('接受 assets/ 下的图片资源', () => {
    expect(
      pluginManifestSchema.safeParse(
        makeManifest([{ id: 'n', title: 'N', viewId: 'v', iconAsset: 'assets/icon.svg' }])
      ).success
    ).toBe(true);
    expect(
      pluginManifestSchema.safeParse(
        makeManifest([{ id: 'n', title: 'N', viewId: 'v', iconAsset: 'assets/logo.png' }])
      ).success
    ).toBe(true);
  });

  it('拒绝非 assets/ 或非图片路径', () => {
    const invalid = ['../secret.png', 'dist/renderer.mjs', 'assets/icon.txt', 'icon.svg', ''];
    for (const iconAsset of invalid) {
      expect(
        pluginManifestSchema.safeParse(
          makeManifest([{ id: 'n', title: 'N', viewId: 'v', iconAsset }])
        ).success
      ).toBe(false);
    }
  });

  it('仍支持内置图标名 icon', () => {
    expect(
      pluginManifestSchema.safeParse(
        makeManifest([{ id: 'n', title: 'N', viewId: 'v', icon: 'spark' }])
      ).success
    ).toBe(true);
  });
});
