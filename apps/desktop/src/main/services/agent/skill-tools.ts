/**
 * Skill 管理工具：列出、读取、创建、更新、删除、导入与刷新用户 Skill。
 */
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { getAppDataPaths, getBuiltinSkillsDirectory } from '../storage/paths';
import type { SkillService } from '../skills/skill-service';

export interface SkillToolOptions {
  skills?: SkillService;
  skillsDir?: string;
  builtinDir?: string;
}

const MAX_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 5_000_000;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const listSchema = z.object({}).strict();
const importSchema = z.object({ sourceDir: z.string().min(1) }).strict();
const deleteSchema = z.object({ id: z.string().min(1) }).strict();
const updateSchema = z
  .object({
    id: z.string().min(1),
    files: z.record(z.string(), z.string()).optional(),
    delete: z.array(z.string()).optional()
  })
  .strict()
  .refine((value) => Boolean(Object.keys(value.files ?? {}).length || value.delete?.length), {
    message: '至少需要 files 或 delete'
  });
const createSchema = z
  .object({
    id: z.string().regex(SKILL_NAME_PATTERN),
    files: z.record(z.string(), z.string()).optional(),
    fromSkillId: z.string().min(1).optional(),
    overwrite: z.boolean().optional()
  })
  .strict()
  .refine((value) => Boolean(value.files || value.fromSkillId), {
    message: '至少需要 files 或 fromSkillId'
  });

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const skillToolDefinitions: AgentToolDefinition[] = [
  tool('skill_list', '列出已安装 Skill 的元信息、来源和版本。', {}, [], false),
  tool('skill_refresh', '清除缓存并重新扫描 Skill 目录。', {}, [], false),
  tool(
    'skill_import',
    '从指定目录导入包含 SKILL.md 的 Skill 目录。',
    { sourceDir: { type: 'string' } },
    ['sourceDir'],
    true
  ),
  tool(
    'skill_create',
    '创建一个用户 Skill；files 必须包含 SKILL.md，也可用 fromSkillId 复制；内置 Skill 只读。',
    {
      id: { type: 'string' },
      files: { type: 'object', additionalProperties: { type: 'string' } },
      fromSkillId: { type: 'string' },
      overwrite: { type: 'boolean' }
    },
    ['id'],
    true
  ),
  tool(
    'skill_update',
    '修改用户 Skill 的文件或删除资源文件；内置 Skill 只读。',
    {
      id: { type: 'string' },
      files: { type: 'object', additionalProperties: { type: 'string' } },
      delete: { type: 'array', items: { type: 'string' } }
    },
    ['id'],
    true
  ),
  tool(
    'skill_delete',
    '删除用户 Skill；内置 Skill 不能删除。',
    { id: { type: 'string' } },
    ['id'],
    true
  )
];

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const safeFile = (file: string): boolean => {
  const normalized = file.replace(/\\/g, '/');
  return (
    Boolean(normalized) &&
    !isAbsolute(file) &&
    !normalized.includes('\0') &&
    !normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  );
};

const writeFiles = async (directory: string, files: Record<string, string>): Promise<void> => {
  const entries = Object.entries(files);
  if (entries.length > MAX_FILES) throw new Error(`文件数不能超过 ${MAX_FILES}`);
  let total = 0;
  for (const [file, content] of entries) {
    if (!safeFile(file)) throw new Error(`路径不合法：${file}`);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error(`文件过大：${file}`);
    total += bytes;
    const target = join(directory, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  if (total > MAX_TOTAL_BYTES) throw new Error('文件总大小超过 5MB');
};

const readName = async (directory: string): Promise<string | undefined> => {
  try {
    const raw = await readFile(join(directory, 'SKILL.md'), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return undefined;
    const fields = parseYaml(match[1] ?? '') as { name?: unknown } | null;
    return typeof fields?.name === 'string' ? fields.name : undefined;
  } catch {
    return undefined;
  }
};

const replaceSkillDirectory = async (
  skillsDir: string,
  id: string,
  staging: string,
  hadTarget: boolean
): Promise<{ target: string; backup?: string }> => {
  const target = join(skillsDir, id);
  const backup = join(skillsDir, `.backup-${id}-${Date.now()}`);
  if (hadTarget) await rename(target, backup);
  try {
    await rename(staging, target);
  } catch (error) {
    if (hadTarget) await rename(backup, target).catch(() => undefined);
    throw error;
  }
  return { target, ...(hadTarget ? { backup } : {}) };
};

const getDirs = (options: SkillToolOptions) => ({
  skillsDir: options.skillsDir ?? getAppDataPaths().skills,
  builtinDir: options.builtinDir ?? getBuiltinSkillsDirectory()
});

/**
 * 执行 Skill 管理工具；直接操作用户目录，不依赖工作区授权。
 */
export const executeSkillTool = async (
  name: string,
  input: unknown,
  options: SkillToolOptions = {}
): Promise<ToolExecutionResult> => {
  const skills = options.skills;
  if (!skills) return failure('SKILLS_UNAVAILABLE', 'Skill 服务不可用');
  const { skillsDir, builtinDir } = getDirs(options);

  if (name === 'skill_list') {
    if (!listSchema.safeParse(input).success) return failure('SKILL_INVALID_INPUT', '参数不合法');
    return success({ skills: await skills.scan() });
  }

  if (name === 'skill_refresh') {
    if (!listSchema.safeParse(input).success) return failure('SKILL_INVALID_INPUT', '参数不合法');
    return success({ skills: await skills.refresh() });
  }

  if (name === 'skill_import') {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return failure('SKILL_INVALID_INPUT', 'Skill 路径不合法');
    try {
      return success({ skills: await skills.importDirectory(parsed.data.sourceDir) });
    } catch (error) {
      return failure(
        'SKILL_IMPORT_FAILED',
        error instanceof Error ? error.message : '导入 Skill 失败'
      );
    }
  }

  if (name === 'skill_delete') {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return failure('SKILL_INVALID_INPUT', 'Skill id 不合法');
    try {
      return success({ skills: await skills.delete(parsed.data.id) });
    } catch (error) {
      return failure(
        'SKILL_DELETE_FAILED',
        error instanceof Error ? error.message : '删除 Skill 失败'
      );
    }
  }

  if (name === 'skill_update' || name === 'skill_create') {
    const parsed = (name === 'skill_update' ? updateSchema : createSchema).safeParse(input);
    if (!parsed.success) return failure('SKILL_INVALID_INPUT', 'Skill 文件参数不合法');
    const id = parsed.data.id;
    const current = (await skills.scan()).find((skill) => skill.id === id);
    if (name === 'skill_update') {
      if (!current) return failure('SKILL_NOT_FOUND', 'Skill 不存在');
      if (current.source === 'builtin')
        return failure('SKILL_BUILTIN_READONLY', '内置 Skill 不能修改');
    } else if (current?.source === 'builtin') {
      return failure('SKILL_BUILTIN_READONLY', '内置 Skill 不能覆盖');
    }
    const overwrite =
      name === 'skill_update' || (parsed.data as { overwrite?: boolean }).overwrite === true;
    const target = join(skillsDir, id);
    const hadTarget = await stat(target)
      .then(() => true)
      .catch(() => false);
    if (name === 'skill_create' && !overwrite && hadTarget) {
      return failure('SKILL_EXISTS', 'Skill 目录已存在；如需覆盖请传 overwrite: true');
    }
    await mkdir(skillsDir, { recursive: true });
    const staging = await mkdtemp(join(skillsDir, '.skill-'));
    try {
      if (name === 'skill_update' || (parsed.data as { fromSkillId?: string }).fromSkillId) {
        const sourceId = (parsed.data as { fromSkillId?: string }).fromSkillId;
        const sourceDir = sourceId ? join(skillsDir, sourceId) : target;
        let source = sourceDir;
        if (
          !(await stat(source)
            .then(() => true)
            .catch(() => false))
        ) {
          source = join(builtinDir, sourceId ?? id);
        }
        await cp(source, staging, { recursive: true, force: true });
        if (sourceId) {
          const nameInSkill = await readName(staging);
          if (!nameInSkill) throw new Error('源 Skill 缺少 frontmatter name');
          const skillFile = join(staging, 'SKILL.md');
          const text = await readFile(skillFile, 'utf8');
          await writeFile(skillFile, text.replace(/^name:.*$/m, `name: ${id}`), 'utf8');
        }
      } else {
        await writeFiles(staging, parsed.data.files ?? {});
      }
      if (
        parsed.data.files &&
        (name === 'skill_update' || (parsed.data as { fromSkillId?: string }).fromSkillId)
      ) {
        await writeFiles(staging, parsed.data.files);
      }
      const parsedName = await readName(staging);
      if (!parsedName || !SKILL_NAME_PATTERN.test(parsedName)) {
        throw new Error('SKILL.md frontmatter name 必须是小写 slug');
      }
      const deleteFiles =
        'delete' in parsed.data ? ((parsed.data as { delete?: string[] }).delete ?? []) : [];
      for (const file of deleteFiles) {
        if (!safeFile(file)) throw new Error(`路径不合法：${file}`);
        await rm(join(staging, file), { recursive: true, force: true });
      }
      const replaced = await replaceSkillDirectory(skillsDir, id, staging, hadTarget);
      try {
        const list = await skills.refresh();
        if (!list.some((skill) => skill.id === id)) throw new Error('Skill 校验失败');
        if (replaced.backup) {
          await rm(replaced.backup, { recursive: true, force: true }).catch((error: unknown) => {
            console.error(`Skill 旧版本清理失败：${id}`, error);
          });
        }
        return success({ skills: list, id });
      } catch (error) {
        // 新目录校验失败时恢复旧版本，避免留下不可用 Skill
        await rm(replaced.target, { recursive: true, force: true }).catch(() => undefined);
        if (replaced.backup) await rename(replaced.backup, replaced.target).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      return failure(
        'SKILL_WRITE_FAILED',
        error instanceof Error ? error.message : '写入 Skill 失败'
      );
    }
  }

  return failure('SKILL_UNKNOWN_ACTION', `未知 Skill 操作：${name}`);
};
