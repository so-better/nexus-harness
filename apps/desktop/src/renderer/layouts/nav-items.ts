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

/** 默认（内置）区块 id：会话 */
export const SESSIONS_NAV_ID = 'sessions';

/** 导航菜单清单；数组顺序即展示顺序，首项作为默认区块 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: SESSIONS_NAV_ID,
    labelKey: 'nav.sessions',
    icon: () => h(AppIcon, { name: 'message', size: NAV_ICON_SIZE })
  }
];

/**
 * 导航栏渲染项：内置项与插件项合并后的统一形态。
 */
export interface RailNavItem {
  /** 唯一标识；内置为 NAV_ITEMS.id，插件为 plugin:<pluginId>:<navId> */
  key: string;
  /** 已解析的展示文案（内置走 i18n，插件用 manifest title） */
  label: string;
  /** 图标组件 */
  icon: Component;
  /** 插件导航项所属插件与视图；内置项为空 */
  pluginId?: string;
  viewId?: string;
}
