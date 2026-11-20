// @vitest-environment node
/**
 * Agent 设置：默认步骤数与持久化边界。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_MAX_STEPS_DEFAULT } from '@shared/ipc/contracts';
import { loadAgentSettings, saveAgentSettings } from './agent-settings';

describe('agent settings', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-agent-settings-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('defaults to ten steps and persists a valid value', async () => {
    expect(await loadAgentSettings(root)).toEqual({ maxSteps: AGENT_MAX_STEPS_DEFAULT });
    await expect(saveAgentSettings({ maxSteps: 24 }, root)).resolves.toEqual({ maxSteps: 24 });
    expect(await loadAgentSettings(root)).toEqual({ maxSteps: 24 });
  });

  it('rejects values above the supported maximum', async () => {
    await expect(saveAgentSettings({ maxSteps: 51 }, root)).rejects.toThrow();
    expect(await loadAgentSettings(root)).toEqual({ maxSteps: AGENT_MAX_STEPS_DEFAULT });
  });
});
