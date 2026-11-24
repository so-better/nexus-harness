/**
 * 本地数据位置访问：只允许宿主白名单内的目录或配置文件。
 */

import type { OpenDataLocation } from '@shared/ipc/contracts';
import { nexus } from './nexus-bridge';
import { unwrap } from './ipc';

/**
 * 打开插件、Skill、MCP 或知识库数据目录。
 */
export const openDataLocation = async (target: OpenDataLocation): Promise<void> => {
  unwrap(await nexus.app.openDataLocation(target));
};
