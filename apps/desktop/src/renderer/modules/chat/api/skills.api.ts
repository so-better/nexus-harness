/**
 * Skill API：通过 preload 读取可用 Skill。
 */

import type { SkillSummary } from '@shared/skills';
import { nexus } from '@/app/nexus-bridge';
import { unwrap } from '@/app/ipc';

export const listSkills = async (): Promise<SkillSummary[]> => unwrap(await nexus.skills.list());

export const importSkillDirectory = async (): Promise<SkillSummary[] | null> =>
  unwrap(await nexus.skills.importDirectory());

export const deleteSkill = async (id: string): Promise<SkillSummary[]> =>
  unwrap(await nexus.skills.delete(id));
