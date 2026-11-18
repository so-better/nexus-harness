/**
 * 敏感路径策略：阻止把用户凭据目录、密钥文件或文件系统根授权给 Agent。
 */

import { basename } from 'node:path';

const SENSITIVE_SEGMENTS = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.kube',
  '.docker',
  '.password-store'
]);

const SENSITIVE_BASENAMES = new Set([
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '.env',
  '.env.local',
  '.netrc',
  '.npmrc',
  '.pypirc',
  'credentials'
]);

const SENSITIVE_FRAGMENTS = [
  '/.config/gcloud',
  '/library/keychains',
  '/library/cookies',
  '/library/safari',
  '/library/application support/google/chrome',
  '/library/application support/firefox',
  '/appdata/roaming/microsoft/credentials',
  '/appdata/local/microsoft/credentials',
  '/appdata/local/google/chrome',
  '/.local/share/keyrings'
];

const normalize = (path: string): string => path.replace(/\\/g, '/').toLowerCase();

/**
 * 判断是否为文件系统根目录；根目录不允许作为工作区。
 */
export const isFilesystemRoot = (path: string): boolean => {
  const normalized = normalize(path);
  return normalized === '/' || /^[a-z]:\/?$/.test(normalized);
};

/**
 * 判断路径是否命中敏感目录或密钥文件规则。
 */
export const isSensitivePath = (path: string): boolean => {
  const normalized = normalize(path);
  if (isFilesystemRoot(path)) return true;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (SENSITIVE_BASENAMES.has(basename(normalized))) return true;
  return SENSITIVE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
};

/**
 * 授权 root 前执行强校验。
 */
export const assertGrantableRoot = (path: string): void => {
  if (isSensitivePath(path)) throw new Error(`敏感路径不可授权：${path}`);
};
