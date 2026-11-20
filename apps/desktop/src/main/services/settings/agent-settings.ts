/**
 * Agent 运行设置：默认 10 步，最大 50 步。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AGENT_MAX_STEPS_DEFAULT,
  agentSettingsSchema,
  type AgentSettings
} from '@shared/ipc/contracts';
import { getAppDataPaths } from '../storage/paths';

const FILE_NAME = 'agent.json';

/**
 * 读取 Agent 设置；文件缺失或无效时回退默认值。
 */
export const loadAgentSettings = async (settingsDir?: string): Promise<AgentSettings> => {
  try {
    const raw = await readFile(join(settingsDir ?? getAppDataPaths().settings, FILE_NAME), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const value =
      parsed && typeof parsed === 'object' && 'maxSteps' in parsed
        ? (parsed as { maxSteps?: unknown }).maxSteps
        : undefined;
    const result = agentSettingsSchema.safeParse({ maxSteps: value });
    return result.success ? result.data : { maxSteps: AGENT_MAX_STEPS_DEFAULT };
  } catch {
    return { maxSteps: AGENT_MAX_STEPS_DEFAULT };
  }
};

/**
 * 保存 Agent 设置。
 */
export const saveAgentSettings = async (
  input: AgentSettings,
  settingsDir?: string
): Promise<AgentSettings> => {
  const parsed = agentSettingsSchema.parse(input);
  const directory = settingsDir ?? getAppDataPaths().settings;
  await mkdir(directory, { recursive: true });
  const target = join(directory, FILE_NAME);
  const temporary = join(directory, `${FILE_NAME}.${randomUUID()}.tmp`);
  try {
    // 先写临时文件再 rename，避免进程中断留下半截 JSON
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return parsed;
};
