/**
 * 左侧导航栏：合并内置项（NAV_ITEMS）与插件 navigation 贡献项，并管理与切换当前区块。
 * 插件项图标：声明 iconAsset 时用插件资源（CSS mask 单色渲染，随主题）；否则用内置 AppIcon 名，未知名退回 spark。
 * 选中插件项时打开主区（右侧整页）视图，选中内置项时关闭主区视图。
 */

import { computed, h, ref, watch, type Component, type ComputedRef, type Ref } from 'vue';
import AppIcon, { APP_ICON_NAMES, type AppIconName } from '@/components/AppIcon.vue';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore } from '@/plugin-runtime/runtime.store';
import { NAV_ITEMS, SESSIONS_NAV_ID, type RailNavItem } from './nav-items';

const NAV_ICON_SIZE = 20;

/**
 * 插件导航图标组件。
 * - 声明 iconAsset：用插件资源 URL 做 CSS mask，`background: currentColor` 使其随主题单色显示；
 * - 否则回退到宿主内置图标名（AppIcon），未知名称再退回 spark。
 */
const pluginIcon = (entry: { pluginId: string; icon?: string; iconAsset?: string }): Component => {
  if (entry.iconAsset) {
    const url = `nexus-plugin://${entry.pluginId}/${entry.iconAsset}`;
    return () =>
      h('span', {
        'aria-hidden': 'true',
        style: {
          display: 'block',
          flex: 'none',
          width: `${NAV_ICON_SIZE}px`,
          height: `${NAV_ICON_SIZE}px`,
          backgroundColor: 'currentColor',
          maskImage: `url("${url}")`,
          WebkitMaskImage: `url("${url}")`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain'
        }
      });
  }
  const name =
    entry.icon && (APP_ICON_NAMES as readonly string[]).includes(entry.icon)
      ? (entry.icon as AppIconName)
      : 'spark';
  return () => h(AppIcon, { name, size: NAV_ICON_SIZE });
};

/** 导航栏对外状态与操作 */
export interface RailNav {
  items: ComputedRef<RailNavItem[]>;
  activeKey: Ref<string>;
  activeLabel: ComputedRef<string>;
  isPluginSection: ComputedRef<boolean>;
  select: (key: string) => void;
}

/**
 * 组合导航栏项并管理当前区块；随语言与插件启用状态响应式变化。
 */
export const useRailNav = (): RailNav => {
  const runtime = usePluginRuntimeStore();

  const items = computed<RailNavItem[]>(() => [
    ...NAV_ITEMS.map((item) => ({
      key: item.id,
      label: t(item.labelKey),
      icon: item.icon
    })),
    ...runtime.navigationEntries.map((entry) => ({
      key: `plugin:${entry.pluginId}:${entry.id}`,
      label: entry.title,
      icon: pluginIcon(entry),
      pluginId: entry.pluginId,
      viewId: entry.viewId
    }))
  ]);

  const activeKey = ref(SESSIONS_NAV_ID);
  const activeItem = computed(() => items.value.find((item) => item.key === activeKey.value));
  const isPluginSection = computed(() => Boolean(activeItem.value?.pluginId));
  const activeLabel = computed(() => activeItem.value?.label ?? items.value[0]?.label ?? '');

  /** 切换区块：插件项打开主区视图，其余关闭主区视图回到默认布局 */
  const select = (key: string): void => {
    activeKey.value = key;
    const item = items.value.find((entry) => entry.key === key);
    if (item?.pluginId && item.viewId) {
      runtime.openMainView(item.pluginId, item.viewId).catch((error: unknown) => {
        console.error('打开插件视图失败', error);
      });
    } else {
      runtime.closeMainView();
    }
  };

  // 插件被禁用/卸载导致当前区块消失时，回退到默认区块
  watch(items, (list) => {
    if (!list.some((item) => item.key === activeKey.value)) {
      activeKey.value = SESSIONS_NAV_ID;
      runtime.closeMainView();
    }
  });

  return { items, activeKey, activeLabel, isPluginSection, select };
};
