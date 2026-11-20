/**
 * 命令面板展示项：内置命令、插件命令与会话快捷入口共享同一列表。
 */
import type { AppIconName } from '@/components/AppIcon.vue';

export interface PaletteCommand {
  id: string;
  title: string;
  shortcut?: string;
  source: string;
  icon?: AppIconName;
}
