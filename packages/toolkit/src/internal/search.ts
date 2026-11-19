/**
 * glob/grep 共享的目录遍历与路径校验。
 */

import { readdir, realpath } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isSensitivePath } from '@nexus/runtime-utils';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  '.next',
  '.cache',
  'coverage'
]);

export const MAX_SEARCH_RESULTS = 200;
export const MAX_GREP_FILE_BYTES = 1_000_000;
export const MAX_GREP_OUTPUT_BYTES = 200_000;

export const resolveSearchRoot = async (
  roots: readonly string[],
  target: string
): Promise<string> => {
  const resolved = await realpath(target);
  const allowed = roots.some((root) => resolved === root || resolved.startsWith(`${root}${sep}`));
  if (!allowed || isSensitivePath(resolved)) {
    throw Object.assign(new Error('路径不在授权范围内'), { code: 'PATH_OUTSIDE_ROOT' });
  }
  return resolved;
};

export const globToRegExp = (pattern: string): RegExp => {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[\\^$+.()|[\]{}]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
};

export const walkFiles = async (
  root: string,
  target: string,
  onFile: (path: string, relativePath: string) => Promise<boolean | void> | boolean | void
): Promise<boolean> => {
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.ignore') {
      if (entry.isDirectory()) continue;
    }
    const path = join(target, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || isSensitivePath(path)) continue;
      if (await walkFiles(root, path, onFile)) return true;
      continue;
    }
    if (!entry.isFile()) continue;
    if (await onFile(path, relative(root, path).split(sep).join('/'))) return true;
  }
  return false;
};
