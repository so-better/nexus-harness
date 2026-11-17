/* 主窗口创建：只负责窗口生命周期与安全边界，不承载业务逻辑。 */

import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

const preloadPath = join(__dirname, '../preload/index.js');
const rendererHtml = join(__dirname, '../renderer/index.html');

/* 创建主窗口；渲染进程保持空白，后续由页面设计接管。 */
export const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
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
