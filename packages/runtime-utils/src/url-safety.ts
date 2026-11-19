/**
 * 网络地址安全工具：拒绝私网、回环与云元数据地址。
 */

import { lookup } from 'node:dns/promises';

const isPrivateAddress = (address: string): boolean => {
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd')) return true;
  if (address.startsWith('fe80:')) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const [a = 0, b = 0] = address.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

/**
 * 校验 URL 并拒绝私网、回环与云元数据地址。
 */
export const assertPublicUrl = async (raw: string): Promise<URL> => {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http/https URL');
  }
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
    throw new Error('禁止访问本机地址');
  }
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('禁止访问私网地址');
  }
  return url;
};
