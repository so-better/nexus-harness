/**
 * 敏感路径策略测试。
 */

import { describe, expect, it } from 'vitest';
import { isFilesystemRoot, isSensitivePath } from './path-policy';

describe('path policy', () => {
  it('rejects filesystem roots and credential directories', () => {
    expect(isFilesystemRoot('/')).toBe(true);
    expect(isFilesystemRoot('C:\\')).toBe(true);
    expect(isSensitivePath('/Users/me/.ssh')).toBe(true);
    expect(isSensitivePath('/Users/me/Library/Keychains')).toBe(true);
    expect(isSensitivePath('/Users/me/.config/gcloud')).toBe(true);
    expect(isSensitivePath('/Users/me/.ssh/id_ed25519')).toBe(true);
  });

  it('allows normal project paths', () => {
    expect(isSensitivePath('/Users/me/projects/nexus')).toBe(false);
    expect(isSensitivePath('/tmp/workspace/.env.example')).toBe(false);
  });
});
