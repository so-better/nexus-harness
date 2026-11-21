// @vitest-environment node
/**
 * Skill 管理工具：创建、更新、删除、列表与刷新。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillService } from '../skills/skill-service';
import { executeSkillTool } from './skill-tools';

const skillMd = (name: string, description = 'demo') =>
  `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  tags: [demo]\n  version: 1.0.0\n  requires: [read]\n---\n# ${name}\n`;

describe('skill tools', () => {
  let root = '';
  let builtinRoot = '';
  let service: SkillService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-skill-tools-'));
    builtinRoot = await mkdtemp(join(tmpdir(), 'nexus-skill-builtin-'));
    service = new SkillService(root, builtinRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(builtinRoot, { recursive: true, force: true });
  });

  it('creates, updates, lists and deletes a user skill', async () => {
    const created = await executeSkillTool(
      'skill_create',
      { id: 'demo-skill', files: { 'SKILL.md': skillMd('demo-skill') } },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(created.ok).toBe(true);
    expect(await readFile(join(root, 'demo-skill', 'SKILL.md'), 'utf8')).toContain('demo-skill');

    const updated = await executeSkillTool(
      'skill_update',
      { id: 'demo-skill', files: { 'assets/note.txt': 'hello' } },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(updated.ok).toBe(true);
    expect(await readFile(join(root, 'demo-skill', 'assets', 'note.txt'), 'utf8')).toBe('hello');

    const listed = await executeSkillTool(
      'skill_list',
      {},
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(JSON.parse(listed.output).skills).toContainEqual(
      expect.objectContaining({ id: 'demo-skill', source: 'user' })
    );

    const deleted = await executeSkillTool(
      'skill_delete',
      { id: 'demo-skill' },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(deleted.ok).toBe(true);
    expect(JSON.parse(deleted.output).skills).toEqual([]);
  });

  it('returns structured errors for imports and built-in skills', async () => {
    const missing = await executeSkillTool(
      'skill_import',
      { sourceDir: join(root, 'missing-skill') },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'SKILL_IMPORT_FAILED' } });

    await mkdir(join(builtinRoot, 'builtin-demo'), { recursive: true });
    await writeFile(join(builtinRoot, 'builtin-demo', 'SKILL.md'), skillMd('builtin-demo'));
    await mkdir(join(root, 'builtin-demo'), { recursive: true });
    await writeFile(join(root, 'builtin-demo', 'SKILL.md'), skillMd('builtin-demo'));
    const builtin = await executeSkillTool(
      'skill_update',
      { id: 'builtin-demo', files: { 'assets/x.txt': 'x' } },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(builtin).toMatchObject({
      ok: false,
      error: { code: 'SKILL_BUILTIN_READONLY' }
    });
  });

  it('copies a built-in skill into a new user skill and refreshes manually', async () => {
    await mkdir(join(builtinRoot, 'builtin-demo'), { recursive: true });
    await writeFile(join(builtinRoot, 'builtin-demo', 'SKILL.md'), skillMd('builtin-demo'));
    const copied = await executeSkillTool(
      'skill_create',
      { id: 'custom-demo', fromSkillId: 'builtin-demo' },
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(copied.ok).toBe(true);
    expect(await readFile(join(root, 'custom-demo', 'SKILL.md'), 'utf8')).toContain('name: custom-demo');

    await mkdir(join(root, 'manual-skill'), { recursive: true });
    await writeFile(join(root, 'manual-skill', 'SKILL.md'), skillMd('manual-skill'));
    const refreshed = await executeSkillTool(
      'skill_refresh',
      {},
      { skills: service, skillsDir: root, builtinDir: builtinRoot }
    );
    expect(JSON.parse(refreshed.output).skills).toContainEqual(
      expect.objectContaining({ id: 'manual-skill' })
    );
  });
});
