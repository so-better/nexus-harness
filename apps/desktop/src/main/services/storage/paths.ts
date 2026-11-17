/* userData 目录结构：集中定义并确保插件、技能、MCP 等目录存在。 */

import { app } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface AppDataPaths {
  root: string;
  plugins: string;
  skills: string;
  mcp: string;
  settings: string;
  files: string;
  artifacts: string;
  checkpoints: string;
  logs: string;
}

/* 计算全部运行时路径；路径统一收敛在 userData 下。 */
export const getAppDataPaths = (): AppDataPaths => {
  const root = app.getPath('userData');

  return {
    root,
    plugins: join(root, 'plugins'),
    skills: join(root, 'skills'),
    mcp: join(root, 'mcp'),
    settings: join(root, 'settings'),
    files: join(root, 'files'),
    artifacts: join(root, 'artifacts'),
    checkpoints: join(root, 'checkpoints'),
    logs: join(root, 'logs')
  };
};

/* 启动时创建缺失目录；失败时向上抛出，由启动流程统一处理。 */
export const ensureAppDataDirectories = async (): Promise<void> => {
  const paths = getAppDataPaths();
  const directories = [
    paths.plugins,
    paths.skills,
    paths.mcp,
    paths.settings,
    paths.files,
    paths.artifacts,
    paths.checkpoints,
    paths.logs
  ];

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
};
