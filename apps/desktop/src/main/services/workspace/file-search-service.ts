/**
 * 工作区文件搜索：在会话 roots 内做轻量、只读的文件名检索。
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { isSensitivePath } from '@nexus/tools';

export interface WorkspaceFileReference {
  path: string;
  root: string;
  relativePath: string;
  name: string;
}

interface IgnoreRule {
  base: string;
  directoryOnly: boolean;
  negated: boolean;
  pattern: RegExp;
}

interface CacheEntry {
  expiresAt: number;
  files: WorkspaceFileReference[];
}

const MAX_FILES = 10_000;
const MAX_DEPTH = 12;
const CACHE_TTL_MS = 5_000;
const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  'target'
]);

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WorkspaceFileReference[]>>();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 把 gitignore glob 转为相对 ignore 文件所在目录的正则。
 */
const globToRegExp = (pattern: string, anchored: boolean): RegExp => {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const hasSlash = normalized.includes('/');
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      source += normalized[index + 2] === '/' ? '(?:.*/)?' : '.*';
      index += 2;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char!);
    }
  }
  const prefix = anchored || hasSlash ? '^' : '(^|/)';
  return new RegExp(`${prefix}${source}(/|$)`);
};

/**
 * 读取目录级 .gitignore/.ignore；返回相对该目录的规则。
 */
const readIgnoreRules = async (root: string, directory: string): Promise<IgnoreRule[]> => {
  const rules: IgnoreRule[] = [];
  const base = relative(root, directory).split(sep).join('/');
  for (const file of ['.gitignore', '.ignore']) {
    const content = await readFile(join(directory, file), 'utf8').catch(() => '');
    for (const rawLine of content.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const negated = line.startsWith('!');
      if (negated) line = line.slice(1).trim();
      if (!line) continue;
      const directoryOnly = line.endsWith('/');
      const anchored = line.startsWith('/');
      if (anchored) line = line.slice(1);
      rules.push({
        base,
        directoryOnly,
        negated,
        pattern: globToRegExp(line, anchored)
      });
    }
  }
  return rules;
};

const isIgnored = (rules: IgnoreRule[], relativePath: string): boolean => {
  const normalized = relativePath.split(sep).join('/');
  let ignored = false;
  for (const rule of rules) {
    let path = normalized;
    if (rule.base) {
      if (path !== rule.base && !path.startsWith(`${rule.base}/`)) continue;
      path = path === rule.base ? '' : path.slice(rule.base.length + 1);
    }
    if (rule.directoryOnly) path = `${path}/`;
    if (rule.pattern.test(path)) ignored = !rule.negated;
  }
  return ignored;
};

const score = (reference: WorkspaceFileReference, query: string): number => {
  const name = reference.name.toLowerCase();
  const path = reference.relativePath.toLowerCase();
  if (!query) return 100 - path.length;
  if (name === query) return 1000;
  if (name.startsWith(query)) return 800;
  if (name.includes(query)) return 600;
  if (path.includes(query)) return 300;
  return -1;
};

/**
 * 扫描一个 root；目录级 ignore 规则会随递归叠加。
 */
const scanRoot = async (root: string): Promise<WorkspaceFileReference[]> => {
  const result: WorkspaceFileReference[] = [];
  let visited = 0;

  const walk = async (
    directory: string,
    depth: number,
    inheritedRules: IgnoreRule[]
  ): Promise<void> => {
    if (depth > MAX_DEPTH || visited >= MAX_FILES) return;
    const rules = [...inheritedRules, ...(await readIgnoreRules(root, directory))];
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (visited >= MAX_FILES) return;
      visited += 1;
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute);
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
        if (isIgnored(rules, relativePath)) continue;
        await walk(absolute, depth + 1, rules);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSensitivePath(absolute)) continue;
      if (isIgnored(rules, relativePath)) continue;
      result.push({
        path: absolute,
        root,
        relativePath,
        name: entry.name
      });
    }
  };

  await walk(root, 0, []);
  return result;
};

const rootFiles = async (root: string): Promise<WorkspaceFileReference[]> => {
  const cached = cache.get(root);
  if (cached && cached.expiresAt > Date.now()) return cached.files;
  const pending = inflight.get(root);
  if (pending) return pending;

  const promise = scanRoot(root)
    .then((files) => {
      cache.set(root, { expiresAt: Date.now() + CACHE_TTL_MS, files });
      return files;
    })
    .finally(() => inflight.delete(root));
  inflight.set(root, promise);
  return promise;
};

/**
 * 在多个 root 内检索文件名与相对路径；扫描结果短期缓存，避免每次按键全量遍历。
 */
export const searchWorkspaceFiles = async (
  roots: readonly string[],
  rawQuery: string,
  limit = 20
): Promise<WorkspaceFileReference[]> => {
  const query = rawQuery.trim().toLowerCase();
  const maxResults = Math.min(Math.max(limit, 1), 50);
  const result: WorkspaceFileReference[] = [];

  for (const root of roots) {
    const info = await stat(root).catch(() => undefined);
    if (!info) continue;
    if (info.isFile()) {
      if (!isSensitivePath(root)) {
        result.push({ path: root, root, relativePath: basename(root), name: basename(root) });
      }
      continue;
    }
    if (!info.isDirectory()) continue;
    result.push(...(await rootFiles(root)));
  }

  return result
    .filter((reference) => score(reference, query) >= 0)
    .sort(
      (left, right) =>
        score(right, query) - score(left, query) ||
        left.relativePath.localeCompare(right.relativePath)
    )
    .slice(0, maxResults);
};
