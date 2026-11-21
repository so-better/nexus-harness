/**
 * userData 目录结构：集中定义并确保插件、技能、MCP 等目录存在。
 */

import { app } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 内置插件目录：开发态位于应用目录 resources/plugins，打包后位于 resources/plugins。
 */
export const getBuiltinPluginsDirectory = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(__dirname, '../../resources/plugins');

/**
 * 内置 MCP 模板：开发态与打包后均从 resources/mcp 读取。
 */
export const getBuiltinMcpConfigPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'mcp', 'mcp.json')
    : join(__dirname, '../../resources/mcp/mcp.json');

/**
 * 内置 Skill 目录：开发态与打包后均从 resources/skills 读取。
 */
export const getBuiltinSkillsDirectory = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'skills')
    : join(__dirname, '../../resources/skills');

export interface AppDataPaths {
  root: string;
  plugins: string;
  skills: string;
  mcp: string;
  settings: string;
  files: string;
  attachments: string;
  artifacts: string;
  checkpoints: string;
  logs: string;
}

/**
 * 计算全部运行时路径；路径统一收敛在 userData 下。
 */
export const getAppDataPaths = (): AppDataPaths => {
  const root = app.getPath('userData');

  return {
    root,
    plugins: join(root, 'plugins'),
    skills: join(root, 'skills'),
    mcp: join(root, 'mcp'),
    settings: join(root, 'settings'),
    files: join(root, 'files'),
    attachments: join(root, 'attachments'),
    artifacts: join(root, 'artifacts'),
    checkpoints: join(root, 'checkpoints'),
    logs: join(root, 'logs')
  };
};

/**
 * 启动时创建缺失目录；失败时向上抛出，由启动流程统一处理。
 */
export const ensureAppDataDirectories = async (): Promise<void> => {
  const paths = getAppDataPaths();
  const directories = [
    paths.plugins,
    paths.skills,
    paths.mcp,
    paths.settings,
    paths.files,
    paths.attachments,
    paths.artifacts,
    paths.checkpoints,
    paths.logs
  ];

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
};
