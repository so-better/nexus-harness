/**
 * 下拉菜单统一高度：数据列表过长时在菜单内部滚动，避免撑出窗口。
 */
export const MENU_MAX_HEIGHT = 'min(320px, 60vh)';

/**
 * NDropdown 的 menuProps；需要同时开启 scrollable。
 */
export const dropdownMenuProps = () => ({
  style: `max-height: ${MENU_MAX_HEIGHT}`
});

/**
 * NSelect 的 menuProps；菜单自身负责滚动。
 */
export const selectMenuProps = {
  style: `max-height: ${MENU_MAX_HEIGHT}`
};
