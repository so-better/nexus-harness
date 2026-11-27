/**
 * 左侧导航栏菜单配置：图标为自定义渲染组件，可使用 AppIcon、图片、内置 SVG 或字体图标。
 * 新增菜单只需在此追加一项，NavRail 会按顺序自动渲染，无需改动模板。
 */

import { h, type Component } from 'vue';
import type { MessageKey } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

/** 导航菜单项定义 */
export interface NavItem {
  /** 唯一标识，用于选中态与主区切换 */
  id: string;
  /** 文案的 i18n key */
  labelKey: MessageKey;
  /** 图标组件；NavRail 通过 `<component :is>` 渲染，组件内部可为任意内容（图片 / SVG / 字体图标） */
  icon: Component;
}

/** 导航图标默认渲染尺寸 */
const NAV_ICON_SIZE = 20;

/** 导航菜单清单；数组顺序即展示顺序，首项作为默认区块 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'sessions',
    labelKey: 'nav.sessions',
    icon: () => h(AppIcon, { name: 'message', size: NAV_ICON_SIZE })
  }
];
