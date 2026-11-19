/**
 * 文档字体：Office 字体按平台选择；PDF 使用内嵌 Noto Sans SC。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OfficeFonts } from './types';

const FONT_CANDIDATES = [
  new URL('../../assets/fonts', import.meta.url),
  new URL('../assets/fonts', import.meta.url)
].map((url) => fileURLToPath(url));
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
if (resourcesPath) FONT_CANDIDATES.push(join(resourcesPath, 'fonts'));
const FONT_DIR = FONT_CANDIDATES.find((path) => existsSync(path)) ?? FONT_CANDIDATES[0]!;

export const PDF_FONT_REGULAR = `${FONT_DIR}/NotoSansSC-Regular.ttf`;
export const PDF_FONT_BOLD = `${FONT_DIR}/NotoSansSC-Bold.ttf`;

/**
 * 按平台选择 Office 字体。
 */
export const resolveFonts = (platform?: string): OfficeFonts => {
  switch (platform) {
    case 'mac':
    case 'ios':
      return { cjk: 'PingFang SC', latin: 'Helvetica Neue', mono: 'Menlo' };
    case 'windows':
      return { cjk: 'Microsoft YaHei', latin: 'Calibri', mono: 'Consolas' };
    case 'android':
      return { cjk: 'Noto Sans CJK SC', latin: 'Roboto', mono: 'monospace' };
    case 'harmony':
      return { cjk: 'HarmonyOS Sans SC', latin: 'HarmonyOS Sans', mono: 'monospace' };
    case 'linux':
      return { cjk: 'Noto Sans CJK SC', latin: 'Noto Sans', mono: 'monospace' };
    default:
      return { cjk: '微软雅黑', latin: 'Arial', mono: 'Courier New' };
  }
};
