/**
 * 终端默认目录：优先当前工作区，无工作区时回到文件系统根目录。
 */

export const filesystemRoot = (
  platform: NodeJS.Platform = process.platform,
  systemDrive: string | undefined = process.env['SystemDrive']
): string => (platform === 'win32' ? `${systemDrive ?? 'C:'}\\` : '/');

export const resolveTerminalCwd = (workspaceRoot: string | undefined): string =>
  workspaceRoot ?? filesystemRoot();
