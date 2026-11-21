/**
 * 内置 Skill 同步：把安装目录中的内置技能复制到 userData/skills。
 */
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface SyncBuiltinSkillsOptions {
  sourceDir: string;
  destinationDir: string;
}

/**
 * 同步内置技能；同名目录由应用覆盖，其他用户技能保持不动。
 */
export const syncBuiltinSkills = async (
  options: SyncBuiltinSkillsOptions
): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(options.sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const installed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = join(options.sourceDir, entry.name);
    try {
      const skillFile = await readFile(join(source, 'SKILL.md'), 'utf8');
      const frontmatter = skillFile.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!frontmatter) continue;
      const fields = parseYaml(frontmatter[1] ?? '') as { name?: unknown } | null;
      const name = typeof fields?.name === 'string' ? fields.name : '';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        console.error(`内置 Skill name 必须是小写 slug，已跳过：${entry.name}`);
        continue;
      }
      await mkdir(options.destinationDir, { recursive: true });
      const destination = join(options.destinationDir, entry.name);
      await rm(destination, { recursive: true, force: true });
      await cp(source, destination, { recursive: true, force: true });
      installed.push(entry.name);
    } catch (error) {
      console.error(`内置 Skill 同步失败：${entry.name}`, error);
    }
  }
  return installed;
};
