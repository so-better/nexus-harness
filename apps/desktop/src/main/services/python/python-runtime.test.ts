/**
 * Python 运行时：发行资产选取与 userData 安装探测。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installedRuntime, selectPythonAsset, checksumFromSums } from './python-runtime';

const releases = [
  {
    tag_name: '20241016',
    assets: [
      {
        name: 'cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz',
        browser_download_url: 'https://example.com/mac-arm.tgz'
      },
      {
        name: 'cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz.sha256',
        browser_download_url: 'https://example.com/mac-arm.tgz.sha256'
      },
      {
        name: 'cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz',
        browser_download_url: 'https://example.com/linux.tgz'
      },
      {
        name: 'cpython-3.12.7+20241016-x86_64-pc-windows-msvc-install_only_stripped.tar.gz',
        browser_download_url: 'https://example.com/win-stripped.tgz'
      }
    ]
  }
];

describe('selectPythonAsset', () => {
  it('selects the install_only asset for the target triple and resolves its checksum', () => {
    expect(selectPythonAsset(releases, 'darwin', 'arm64')).toEqual({
      name: 'cpython-3.12.7+20241016-aarch64-apple-darwin-install_only.tar.gz',
      url: 'https://example.com/mac-arm.tgz',
      sha256Url: 'https://example.com/mac-arm.tgz.sha256',
      release: '20241016'
    });
  });

  it('returns an asset without checksum when no .sha256 sibling exists', () => {
    expect(selectPythonAsset(releases, 'linux', 'x64')).toMatchObject({
      url: 'https://example.com/linux.tgz'
    });
    expect(selectPythonAsset(releases, 'linux', 'x64')?.sha256Url).toBeUndefined();
  });

  it('skips stripped-only variants and unsupported targets', () => {
    // 仅存在 stripped 版本时不选中（避免使用裁剪版）
    expect(selectPythonAsset(releases, 'win32', 'x64')).toBeUndefined();
    expect(selectPythonAsset(releases, 'darwin', 'ia32')).toBeUndefined();
  });

  it('falls back to SHA256SUMS when no per-asset checksum exists', () => {
    const sumsReleases = [
      {
        tag_name: '20241016',
        assets: [
          {
            name: 'cpython-3.12.7+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz',
            browser_download_url: 'https://example.com/linux.tgz'
          },
          { name: 'SHA256SUMS', browser_download_url: 'https://example.com/SHA256SUMS' }
        ]
      }
    ];

    expect(selectPythonAsset(sumsReleases, 'linux', 'x64')).toMatchObject({
      sha256SumsUrl: 'https://example.com/SHA256SUMS'
    });
    expect(selectPythonAsset(sumsReleases, 'linux', 'x64')?.sha256Url).toBeUndefined();
  });
});

describe('checksumFromSums', () => {
  const digest = 'a'.repeat(64);

  it('parses the digest for the requested file', () => {
    const raw = `${'b'.repeat(64)}  other.tgz\n${digest} *linux.tgz\n`;
    expect(checksumFromSums(raw, 'linux.tgz')).toBe(digest);
  });

  it('returns undefined when the file is absent', () => {
    expect(checksumFromSums(`${digest}  other.tgz\n`, 'linux.tgz')).toBeUndefined();
  });
});

describe('installedRuntime', () => {
  let directory = '';
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-python-test-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns the userData runtime when the interpreter exists', async () => {
    const relative = process.platform === 'win32' ? ['python', 'python.exe'] : ['python', 'bin', 'python3'];
    const file = join(directory, 'python', 'runtime', ...relative);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, '', 'utf8');

    expect(installedRuntime(directory)).toEqual({ file, baseArgs: [], source: 'user-data' });
  });

  it('returns undefined when nothing is installed', () => {
    expect(installedRuntime(directory)).toBeUndefined();
  });
});
