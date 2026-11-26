/**
 * Python 运行时管理：探测系统 Python、按平台选取发行资产、受控安装到 userData，以及 pip 依赖安装。
 * 不硬编码具体下载 URL；通过 python-build-standalone 的 release 列表按目标三元组选取资产，并取同级 .sha256 校验。
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadToFile } from '../net/download';

const execFileAsync = promisify(execFile);

/** python-build-standalone 发行仓库；用 release 列表选取资产，避免硬编码具体版本。 */
const RELEASES_URL =
  'https://api.github.com/repos/astral-sh/python-build-standalone/releases?per_page=30';
const RUNTIME_DIR = 'runtime';
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const INSTALL_MARKER = '.nexus-python.json';
/** 探测结果缓存时长；避免每次 run_python 都 spawn 探测系统解释器 */
const DETECT_TTL_MS = 5_000;

/** 按 5% 粒度取整进度比例，减少无意义的事件抖动。 */
const roundRatio = (value: number): number =>
  Math.min(1, Math.max(0, Math.round(value * 20) / 20));

export interface PythonRuntime {
  /** 解释器可执行文件 */
  file: string;
  /** 解释器前置参数（如 Windows launcher 的 `-3`） */
  baseArgs: string[];
  source: 'user-data' | 'system';
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface PythonAssetSelection {
  name: string;
  url: string;
  sha256Url?: string;
  /** 无独立 .sha256 时的 SHA256SUMS 兜底来源 */
  sha256SumsUrl?: string;
  release: string;
}

const ARCH_TRIPLE: Record<string, Record<string, string>> = {
  win32: { x64: 'x86_64-pc-windows-msvc', arm64: 'aarch64-pc-windows-msvc' },
  darwin: { x64: 'x86_64-apple-darwin', arm64: 'aarch64-apple-darwin' },
  linux: { x64: 'x86_64-unknown-linux-gnu', arm64: 'aarch64-unknown-linux-gnu' }
};

/**
 * 从 release 列表选取匹配当前平台三元组的 install_only 资产；优先非 stripped 版本。
 */
export const selectPythonAsset = (
  releases: Release[],
  platform: NodeJS.Platform,
  arch: string
): PythonAssetSelection | undefined => {
  const triple = ARCH_TRIPLE[platform]?.[arch];
  if (!triple) return undefined;
  const suffix = '-install_only.tar.gz';
  const matches = (asset: ReleaseAsset): boolean =>
    asset.name.includes(triple) &&
    asset.name.endsWith(suffix) &&
    !asset.name.endsWith(`_stripped${suffix}`);
  for (const release of releases) {
    const asset = release.assets.find(matches);
    if (!asset) continue;
    const sha = release.assets.find((item) => item.name === `${asset.name}.sha256`);
    // 部分 release 只提供聚合 SHA256SUMS；作为无独立校验和时的兜底
    const sums = sha ? undefined : release.assets.find((item) => item.name === 'SHA256SUMS');
    return {
      name: asset.name,
      url: asset.browser_download_url,
      ...(sha ? { sha256Url: sha.browser_download_url } : {}),
      ...(sums ? { sha256SumsUrl: sums.browser_download_url } : {}),
      release: release.tag_name
    };
  }
  return undefined;
};

/** userData 下解释器相对 runtime 目录的路径（python-build-standalone 解压后自带 python/ 顶层目录）。 */
const interpreterRelative = (platform: NodeJS.Platform): string[] =>
  platform === 'win32'
    ? ['python', 'python.exe']
    : ['python', 'bin', 'python3'];

const runtimeDirectory = (root: string): string => join(root, 'python', RUNTIME_DIR);

const userDataInterpreter = (root: string): string =>
  join(runtimeDirectory(root), ...interpreterRelative(process.platform));

/**
 * 校验解释器可用：执行 `--version` 且输出包含 Python 3。
 */
const probePython = async (file: string, baseArgs: string[]): Promise<boolean> => {
  try {
    const { stdout, stderr } = await execFileAsync(file, [...baseArgs, '--version'], {
      timeout: 5_000,
      windowsHide: true
    });
    return /Python 3\./i.test(`${stdout}${stderr}`);
  } catch {
    return false;
  }
};

/**
 * 读取 userData 下已安装的运行时；不存在或不可用返回 undefined。
 */
export const installedRuntime = (root: string): PythonRuntime | undefined => {
  const file = userDataInterpreter(root);
  return existsSync(file) ? { file, baseArgs: [], source: 'user-data' } : undefined;
};

/** 探测结果缓存：避免高频调用反复 spawn 探测系统解释器。 */
let detectCache: { root: string; at: number; runtime: PythonRuntime | undefined } | undefined;

/**
 * 探测可用 Python：优先 userData 安装版，其次系统 python3/python（Windows 额外尝试 py -3）。
 * 结果缓存数秒，避免高频调用反复 spawn 探测。
 */
export const detectPython = async (root: string): Promise<PythonRuntime | undefined> => {
  const now = Date.now();
  if (detectCache && detectCache.root === root && now - detectCache.at < DETECT_TTL_MS) {
    return detectCache.runtime;
  }
  const runtime = await probeAvailablePython(root);
  detectCache = { root, at: now, runtime };
  return runtime;
};

const probeAvailablePython = async (root: string): Promise<PythonRuntime | undefined> => {
  const installed = installedRuntime(root);
  if (installed) {
    if (await probePython(installed.file, installed.baseArgs)) return installed;
  }
  const candidates: PythonRuntime[] =
    process.platform === 'win32'
      ? [
          { file: 'py', baseArgs: ['-3'], source: 'system' },
          { file: 'python3', baseArgs: [], source: 'system' },
          { file: 'python', baseArgs: [], source: 'system' }
        ]
      : process.platform === 'darwin'
        ? await darwinPythonCandidates()
        : [
            { file: 'python3', baseArgs: [], source: 'system' },
            { file: 'python', baseArgs: [], source: 'system' }
          ];
  for (const candidate of candidates) {
    if (await probePython(candidate.file, candidate.baseArgs)) return candidate;
  }
  return undefined;
};

/** Xcode 命令行工具是否就绪；就绪才敢走 PATH 上的 /usr/bin/python3（否则会弹系统安装框）。 */
async function hasXcodeCommandLineTools(): Promise<boolean> {
  try {
    await execFileAsync('xcode-select', ['-p'], { timeout: 3_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * macOS 候选：存在 Xcode CLT 时用 PATH 上的 python3；否则只探测 Homebrew 路径，
 * 避免执行 /usr/bin/python3（CLT 缺失会弹出系统安装对话框）。
 */
async function darwinPythonCandidates(): Promise<PythonRuntime[]> {
  if (await hasXcodeCommandLineTools()) {
    return [
      { file: 'python3', baseArgs: [], source: 'system' },
      { file: 'python', baseArgs: [], source: 'system' }
    ];
  }
  return [
    { file: '/opt/homebrew/bin/python3', baseArgs: [], source: 'system' },
    { file: '/usr/local/bin/python3', baseArgs: [], source: 'system' }
  ];
}

/** 拉取 release 列表；GitHub API 需要 UA 且建议限定 Accept。 */
const fetchReleases = async (signal?: AbortSignal): Promise<Release[]> => {
  const response = await fetch(RELEASES_URL, {
    signal: signal ?? null,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Nexus-Harness'
    }
  });
  if (!response.ok) throw new Error(`获取 Python 发行列表失败：HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      const record = item as { tag_name?: unknown; assets?: unknown };
      const assets = Array.isArray(record.assets)
        ? record.assets
            .map((entry) => entry as { name?: unknown; browser_download_url?: unknown })
            .filter(
              (entry): entry is { name: string; browser_download_url: string } =>
                typeof entry.name === 'string' && typeof entry.browser_download_url === 'string'
            )
            .map((entry) => ({ name: entry.name, browser_download_url: entry.browser_download_url }))
        : [];
      return { tag_name: typeof record.tag_name === 'string' ? record.tag_name : '', assets };
    })
    .filter((release) => release.assets.length > 0);
};

/**
 * 计算文件 SHA256 十六进制摘要。
 */
const hashFile = async (file: string): Promise<string> =>
  createHash('sha256').update(await readFile(file)).digest('hex');

/**
 * 校验下载文件 SHA256；checksum 文件内容形如 `<hex>  <filename>`。
 */
const verifyChecksum = async (file: string, checksumPath: string): Promise<void> => {
  const raw = await readFile(checksumPath, 'utf8');
  const expected = raw.trim().split(/\s+/)[0]?.toLowerCase();
  if (!expected) throw new Error('校验和文件内容无效');
  if ((await hashFile(file)) !== expected) {
    throw new Error('下载文件校验失败：SHA256 不匹配');
  }
};

/**
 * 从 SHA256SUMS 内容中解析指定文件的期望校验和；缺失返回 undefined。
 */
export const checksumFromSums = (raw: string, fileName: string): string | undefined => {
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match && match[2]?.trim() === fileName) return match[1]?.toLowerCase();
  }
  return undefined;
};

/** 用系统 tar 解压（macOS/Linux 自带；Windows 10+ 自带 bsdtar）。 */
const extractArchive = async (archive: string, destination: string): Promise<void> => {
  try {
    await execFileAsync('tar', ['-xzf', archive, '-C', destination], {
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });
  } catch (error) {
    throw new Error(
      `解压失败，请确认系统 tar 可用：${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/** 安装阶段标记：与 tool.progress 事件 phase 及渲染层 i18n 对应。 */
export type ProgressPhase = 'fetch' | 'download' | 'verify' | 'extract' | 'done';

export interface InstallProgress {
  /** 阶段标记 */
  phase: ProgressPhase;
  /** 可选进度比例 0–1 */
  ratio?: number;
}

export interface InstallOptions {
  signal?: AbortSignal;
  onProgress?: (progress: InstallProgress) => void;
}

/**
 * 下载并安装 Python 到 `<root>/python/runtime`；完成后返回可用运行时。
 * 下载前会选取资产并做 SHA256 校验，缺少校验和则拒绝安装。
 */
export const installPython = async (
  root: string,
  options: InstallOptions = {}
): Promise<PythonRuntime> => {
  const report = options.onProgress ?? ((): void => undefined);
  report({ phase: 'fetch' });
  const asset = selectPythonAsset(await fetchReleases(options.signal), process.platform, process.arch);
  if (!asset) throw new Error('未找到匹配当前平台的 Python 发行资产');
  if (!asset.sha256Url && !asset.sha256SumsUrl) {
    throw new Error('发行资产缺少 SHA256 校验和，已拒绝安装');
  }

  const staging = await mkdtemp(join(tmpdir(), 'nexus-python-'));
  const archive = join(staging, asset.name);
  const checksum = join(staging, `${asset.name}.sha256`);
  const target = runtimeDirectory(root);
  try {
    report({ phase: 'download' });
    await downloadToFile(asset.url, archive, {
      maxBytes: MAX_ARCHIVE_BYTES,
      // 下载占整体进度的大头，映射到 0–0.9，后续阶段补齐剩余比例避免进度条回落
      onProgress: (written, total) =>
        report({
          phase: 'download',
          ...(total ? { ratio: roundRatio((written / total) * 0.9) } : {})
        }),
      ...(options.signal ? { signal: options.signal } : {})
    });
    report({ phase: 'verify', ratio: 0.92 });
    if (asset.sha256Url) {
      await downloadToFile(asset.sha256Url, checksum, {
        maxBytes: 64 * 1024,
        ...(options.signal ? { signal: options.signal } : {})
      });
      await verifyChecksum(archive, checksum);
    } else if (asset.sha256SumsUrl) {
      await downloadToFile(asset.sha256SumsUrl, checksum, {
        maxBytes: 256 * 1024,
        ...(options.signal ? { signal: options.signal } : {})
      });
      const expected = checksumFromSums(await readFile(checksum, 'utf8'), asset.name);
      if (!expected) throw new Error('SHA256SUMS 中缺少目标文件校验和');
      if ((await hashFile(archive)) !== expected) {
        throw new Error('下载文件校验失败：SHA256 不匹配');
      }
    }

    report({ phase: 'extract', ratio: 0.98 });
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await extractArchive(archive, target);

    const file = userDataInterpreter(root);
    if (!existsSync(file) || !(await probePython(file, []))) {
      throw new Error('安装后解释器不可用');
    }
    await writeFile(
      join(target, INSTALL_MARKER),
      `${JSON.stringify({ release: asset.release, asset: asset.name }, null, 2)}\n`,
      'utf8'
    );
    report({ phase: 'done', ratio: 1 });
    const installed: PythonRuntime = { file, baseArgs: [], source: 'user-data' };
    // 刷新探测缓存，后续调用直接命中安装结果
    detectCache = { root, at: Date.now(), runtime: installed };
    return installed;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};

/** 进行中的安装：同一 root 并发请求共享同一次安装，避免相互破坏目录。 */
const installs = new Map<string, Promise<PythonRuntime>>();

/**
 * 单飞安装：同一 root 上并发调用复用同一个安装 Promise。
 */
export const ensureInstalledPython = (
  root: string,
  options: InstallOptions = {}
): Promise<PythonRuntime> => {
  const existing = installs.get(root);
  if (existing) return existing;
  const pending = installPython(root, options).finally(() => installs.delete(root));
  installs.set(root, pending);
  return pending;
};

/**
 * 使用 pip 安装依赖；已满足的包 pip 会快速跳过，属于联网副作用需调用方先行审批。
 */
export const installPackages = async (
  runtime: PythonRuntime,
  packages: readonly string[],
  options: { signal?: AbortSignal } = {}
): Promise<string> => {
  if (packages.length === 0) return '';
  const { stdout, stderr } = await execFileAsync(
    runtime.file,
    [
      ...runtime.baseArgs,
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '--no-input',
      '--',
      ...packages
    ],
    {
      timeout: 300_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      ...(options.signal ? { signal: options.signal } : {})
    }
  );
  return `${stdout}${stderr}`.trim();
};

/**
 * 找出尚未安装的依赖包；命中已安装的包会跳过网络与安装审批。
 * 以 `pip show` 是否输出 `Name:` 判定，兼容发行名与导入名不一致的情况。
 */
export const missingPackages = async (
  runtime: PythonRuntime,
  packages: readonly string[],
  options: { signal?: AbortSignal } = {}
): Promise<string[]> => {
  const missing: string[] = [];
  for (const name of packages) {
    try {
      const { stdout } = await execFileAsync(
        runtime.file,
        [...runtime.baseArgs, '-m', 'pip', 'show', '--disable-pip-version-check', name],
        {
          timeout: 30_000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          ...(options.signal ? { signal: options.signal } : {})
        }
      );
      if (!/^Name:/m.test(stdout)) missing.push(name);
    } catch {
      missing.push(name);
    }
  }
  return missing;
};
