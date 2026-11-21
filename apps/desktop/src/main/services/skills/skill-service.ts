/**
 * Skill 扫描与读取：支持标准 YAML frontmatter、正文和 Skill 资源文件。
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SkillDetail, SkillSummary } from '@shared/skills';
import { getAppDataPaths } from '../storage/paths';

export type SkillMeta = SkillSummary;
export type { SkillDetail };

const MAX_SKILL_BYTES = 200_000;
const MAX_RESOURCE_BYTES = 200_000;
const MAX_IMPORT_FILES = 500;
const MAX_IMPORT_BYTES = 10_000_000;
const MAX_SEARCH_RESULTS = 8;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * 解析 YAML frontmatter；非法 YAML 不阻断 Skill，只是退化为空元信息。
 */
const parseFrontmatter = (
  text: string
): {
  fields: Record<string, unknown>;
  content: string;
} => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fields: {}, content: text };
  try {
    const parsed: unknown = parseYaml(match[1] ?? '');
    return {
      fields: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {},
      content: match[2] ?? ''
    };
  } catch {
    return { fields: {}, content: match[2] ?? '' };
  }
};

const listFiles = async (directory: string): Promise<string[]> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const toSummary = async (
  id: string,
  fields: Record<string, unknown>,
  directory: string
): Promise<SkillSummary> => {
  const metadata =
    fields['metadata'] && typeof fields['metadata'] === 'object'
      ? (fields['metadata'] as Record<string, unknown>)
      : undefined;
  const tags = asStringArray(fields['tags']);
  const requires = asStringArray(fields['requires']);
  return {
    id,
    name: stringValue(fields['name']) || id,
    description: stringValue(fields['description']),
    tags: tags.length ? tags : asStringArray(metadata?.['tags']),
    version:
      stringValue(fields['version']) || stringValue(metadata?.['version']) || '1.0.0',
    requires: requires.length ? requires : asStringArray(metadata?.['requires']),
    ...(stringValue(fields['license'])
      ? { license: stringValue(fields['license']) }
      : stringValue(metadata?.['license'])
        ? { license: stringValue(metadata?.['license']) }
        : {}),
    ...(stringValue(fields['compatibility'])
      ? { compatibility: stringValue(fields['compatibility']) }
      : {}),
    allowedTools: asStringArray(fields['allowed-tools'] ?? fields['allowedTools']),
    ...(metadata ? { metadata } : {}),
    assets: await listFiles(join(directory, 'assets')),
    scripts: await listFiles(join(directory, 'scripts')),
    references: await listFiles(join(directory, 'references'))
  };
};

/**
 * 校验导入目录，避免复制超大目录或符号链接逃逸。
 */
const validateImportDirectory = async (directory: string): Promise<void> => {
  let files = 0;
  let bytes = 0;
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('Skill 目录不能包含符号链接');
      if (entry.isDirectory()) {
        await walk(join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      bytes += (await stat(join(current, entry.name))).size;
      if (files > MAX_IMPORT_FILES) throw new Error(`Skill 文件数超过 ${MAX_IMPORT_FILES}`);
      if (bytes > MAX_IMPORT_BYTES) throw new Error('Skill 目录超过 10MB');
    }
  };
  await walk(directory);
};

/**
 * 扫描 userData/skills，并缓存扫描结果 1 秒。
 */
export class SkillService {
  constructor(private readonly baseDir?: string) {}

  private cache: { at: number; skills: SkillSummary[] } | undefined;

  private get directory(): string {
    return this.baseDir ?? getAppDataPaths().skills;
  }

  async scan(): Promise<SkillSummary[]> {
    if (this.cache && Date.now() - this.cache.at < 1_000) return this.cache.skills;
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    const skills: SkillSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!SKILL_NAME_PATTERN.test(entry.name)) {
        console.error(`Skill 目录必须是小写 slug，已跳过：${entry.name}`);
        continue;
      }
      const directory = join(this.directory, entry.name);
      try {
        const file = join(directory, 'SKILL.md');
        const info = await stat(file);
        if (!info.isFile() || info.size > MAX_SKILL_BYTES) continue;
        const root = await realpath(directory);
        const realFile = await realpath(file);
        if (!realFile.startsWith(`${root}${sep}`)) continue;
        const parsed = parseFrontmatter(await readFile(realFile, 'utf8'));
        const declaredName = stringValue(parsed.fields['name']);
        if (declaredName && !SKILL_NAME_PATTERN.test(declaredName)) {
          console.error(`Skill name 必须是小写 slug，已跳过：${entry.name}`);
          continue;
        }
        skills.push(await toSummary(entry.name, parsed.fields, directory));
      } catch {
        // 单个无效 Skill 跳过
      }
    }
    const sorted = skills.sort((a, b) => a.name.localeCompare(b.name));
    this.cache = { at: Date.now(), skills: sorted };
    return sorted;
  }

  async search(query: string): Promise<SkillSummary[]> {
    const keyword = query.trim().toLowerCase();
    const skills = await this.scan();
    if (!keyword) return skills.slice(0, MAX_SEARCH_RESULTS);
    return skills
      .map((skill) => {
        const name = skill.name.toLowerCase();
        const tags = skill.tags.join(' ').toLowerCase();
        const description = skill.description.toLowerCase();
        return {
          skill,
          score:
            (name.includes(keyword) ? 5 : 0) +
            (tags.includes(keyword) ? 3 : 0) +
            (description.includes(keyword) ? 1 : 0)
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .slice(0, MAX_SEARCH_RESULTS)
      .map((item) => item.skill);
  }

  /**
   * 导入包含 SKILL.md 的完整 Skill 目录，保留 assets/scripts/references。
   */
  async importDirectory(sourceDir: string): Promise<SkillSummary[]> {
    const sourceInfo = await stat(sourceDir);
    if (!sourceInfo.isDirectory()) throw new Error('请选择包含 SKILL.md 的目录');
    const sourceSkill = join(sourceDir, 'SKILL.md');
    const sourceInfoFile = await stat(sourceSkill);
    if (!sourceInfoFile.isFile()) throw new Error('所选目录缺少 SKILL.md');
    const parsed = parseFrontmatter(await readFile(sourceSkill, 'utf8'));
    const declaredName = stringValue(parsed.fields['name']);
    if (declaredName && !SKILL_NAME_PATTERN.test(declaredName)) {
      throw new Error('Skill name 必须是小写 slug');
    }
    const base = basename(sourceDir);
    const rawName = stringValue(parsed.fields['name']) || base;
    const id =
      rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || `skill-${Date.now()}`;
    const sourceReal = await realpath(sourceDir);
    const rootReal = await realpath(this.directory).catch(() => this.directory);
    if (sourceReal === rootReal || sourceReal.startsWith(`${rootReal}${sep}`)) {
      throw new Error('不能导入应用 Skill 目录内的目录');
    }
    await validateImportDirectory(sourceDir);
    const target = join(this.directory, id);
    await rm(target, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true });
    await cp(sourceDir, target, { recursive: true, force: true });
    this.cache = undefined;
    return this.scan();
  }

  /**
   * 删除单个 Skill 目录。
   */
  async delete(id: string): Promise<SkillSummary[]> {
    const normalized = id.trim();
    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.includes('/') ||
      normalized.includes('\\')
    )
      return this.scan();
    await rm(join(this.directory, normalized), { recursive: true, force: true });
    this.cache = undefined;
    return this.scan();
  }

  /**
   * 按目录 ID 或 frontmatter name 解析 Skill，并统一校验目录边界。
   */
  private async resolveSkill(
    name: string
  ): Promise<{ id: string; directory: string; root: string } | undefined> {
    const normalized = name.trim();
    if (!normalized || normalized.includes('/') || normalized.includes('\\')) return undefined;
    const matched = (await this.scan()).find(
      (skill) => skill.id === normalized || skill.name === normalized
    );
    const candidates =
      matched && matched.id !== normalized ? [normalized, matched.id] : [normalized];
    for (const candidate of candidates) {
      if (!SKILL_NAME_PATTERN.test(candidate)) continue;
      const directory = join(this.directory, candidate);
      try {
        const root = await realpath(directory);
        const realFile = await realpath(join(directory, 'SKILL.md'));
        if (!realFile.startsWith(`${root}${sep}`)) continue;
        const info = await stat(realFile);
        if (!info.isFile() || info.size > MAX_SKILL_BYTES) continue;
        return { id: candidate, directory, root };
      } catch {
        // 尝试下一个候选目录
      }
    }
    return undefined;
  }

  async read(name: string): Promise<SkillDetail | undefined> {
    const resolved = await this.resolveSkill(name);
    if (!resolved) return undefined;
    const parsed = parseFrontmatter(await readFile(join(resolved.directory, 'SKILL.md'), 'utf8'));
    return {
      ...(await toSummary(resolved.id, parsed.fields, resolved.directory)),
      content: parsed.content.trim()
    };
  }

  /**
   * 在 Skill scripts 目录内执行脚本；脚本必须通过 Agent 工具审批后才会调用。
   */
  async runScript(
    name: string,
    relativePath: string,
    args: string[] = [],
    timeoutMs = 60_000
  ): Promise<{ ok: boolean; output: string; error?: { code: string; message: string } }> {
    try {
      const resolved = await this.resolveSkill(name);
      if (!resolved) {
        return {
          ok: false,
          output: '',
          error: { code: 'SKILL_NOT_FOUND', message: `Skill 不存在：${name}` }
        };
      }
      const root = resolved.root;
      const target = await realpath(join(root, 'scripts', relativePath));
      if (!target.startsWith(`${join(root, 'scripts')}${sep}`)) {
        return {
          ok: false,
          output: '',
          error: { code: 'SKILL_PATH_DENIED', message: '脚本路径不合法' }
        };
      }
      const info = await stat(target);
      if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) {
        return {
          ok: false,
          output: '',
          error: { code: 'SKILL_SCRIPT_INVALID', message: '脚本文件不合法' }
        };
      }
      const extension = target.slice(target.lastIndexOf('.')).toLowerCase();
      let command: string;
      let commandArgs: string[];
      if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
        command = process.platform === 'win32' ? 'node.exe' : 'node';
        commandArgs = [target, ...args];
      } else if (extension === '.py') {
        command = process.platform === 'win32' ? 'python.exe' : 'python3';
        commandArgs = [target, ...args];
      } else if (extension === '.sh') {
        command = process.platform === 'win32' ? 'bash.exe' : 'bash';
        commandArgs = [target, ...args];
      } else {
        command = target;
        commandArgs = args;
      }
      return await new Promise((resolve) => {
        execFile(
          command,
          commandArgs,
          {
            cwd: join(root, 'scripts'),
            timeout: timeoutMs,
            maxBuffer: 200_000,
            env: {
              PATH: process.env['PATH'] ?? '',
              HOME: process.env['HOME'] ?? '',
              USER: process.env['USER'] ?? '',
              TMPDIR: process.env['TMPDIR'] ?? '',
              SystemRoot: process.env['SystemRoot'] ?? ''
            }
          },
          (error, stdout, stderr) => {
            const output = `${stdout}${stderr}`.slice(0, 200_000);
            if (error) {
              resolve({
                ok: false,
                output,
                error: {
                  code: (error as { killed?: boolean }).killed
                    ? 'SKILL_SCRIPT_TIMEOUT'
                    : 'SKILL_SCRIPT_FAILED',
                  message: error.message
                }
              });
              return;
            }
            resolve({ ok: true, output });
          }
        );
      });
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: {
          code: 'SKILL_SCRIPT_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * 读取 Skill 的 assets/scripts/references 文件；只允许 Skill 目录内路径。
   */
  async readFile(name: string, relativePath: string): Promise<string | undefined> {
    try {
      const resolved = await this.resolveSkill(name);
      if (!resolved) return undefined;
      const root = resolved.root;
      const target = await realpath(join(resolved.directory, relativePath));
      if (target !== root && !target.startsWith(`${root}${sep}`)) return undefined;
      const allowed = ['assets', 'scripts', 'references'].some((folder) =>
        target.startsWith(`${join(root, folder)}${sep}`)
      );
      if (!allowed) return undefined;
      const info = await stat(target);
      if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) return undefined;
      return await readFile(target, 'utf8');
    } catch {
      return undefined;
    }
  }
}
