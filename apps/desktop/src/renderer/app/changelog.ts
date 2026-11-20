/**
 * 更新日志：构建时打包英文与中文两份文件，页面按当前界面语言选择。
 */
import english from '../../../../../CHANGELOG.md?raw';
import chinese from '../../../../../CHANGELOG.zh-CN.md?raw';

export const changelogContent = {
  en: english,
  'zh-CN': chinese
} as const;
