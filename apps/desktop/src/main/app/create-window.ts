/* 主窗口创建：只负责窗口生命周期与安全边界，不承载业务逻辑。 */

import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';

const preloadPath = join(__dirname, '../preload/index.js');
const rendererHtml = join(__dirname, '../renderer/index.html');
const iconPath = join(__dirname, '../../build/icon.png');

/* 创建主窗口；默认铺满当前显示器工作区，渲染进程保持空白。 */
export const createMainWindow = (): BrowserWindow => {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;

  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(rendererHtml);
  }

  return window;
};
