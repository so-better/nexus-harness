// @vitest-environment node
/**
 * 内置 Skill 同步：复制带 frontmatter 的技能目录，不清理用户技能。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncBuiltinSkills } from './builtin-skill-service';

describe('syncBuiltinSkills', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-builtin-skills-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('ships the eleven selected built-in skills', async () => {
    const target = join(root, 'installed');
    const installed = await syncBuiltinSkills({
      sourceDir: join(process.cwd(), 'apps/desktop/resources/skills'),
      destinationDir: target
    });
    expect(installed.sort()).toEqual(
      [
        'bug-reproduce',
        'code-review',
        'codebase-onboarding',
        'data-analysis',
        'documentation-writer',
        'fix-failing-tests',
        'office-report',
        'plugin-development',
        'safe-refactor',
        'skill-development',
        'token-efficient-workflow'
      ].sort()
    );
  });

  it('copies valid built-in skills and preserves user skills', async () => {
    const source = join(root, 'source');
    const target = join(root, 'target');
    await mkdir(join(source, 'bundled'), { recursive: true });
    await writeFile(
      join(source, 'bundled', 'SKILL.md'),
      '---\nname: bundled\ndescription: demo\nversion: 1.0.0\n---\n# Demo\n'
    );
    await mkdir(join(target, 'custom'), { recursive: true });
    await writeFile(join(target, 'custom', 'SKILL.md'), 'custom');

    await expect(syncBuiltinSkills({ sourceDir: source, destinationDir: target })).resolves.toEqual([
      'bundled'
    ]);
    expect(await readFile(join(target, 'bundled', 'SKILL.md'), 'utf8')).toContain('# Demo');
    expect(await readFile(join(target, 'custom', 'SKILL.md'), 'utf8')).toBe('custom');
  });

  it('rejects uppercase or invalid skill names', async () => {
    const source = join(root, 'source');
    const target = join(root, 'target');
    await mkdir(join(source, 'invalid-name'), { recursive: true });
    await writeFile(
      join(source, 'invalid-name', 'SKILL.md'),
      '---\nname: Code Review\ndescription: demo\n---\n# Demo\n'
    );
    await expect(syncBuiltinSkills({ sourceDir: source, destinationDir: target })).resolves.toEqual(
      []
    );
  });

  it('skips directories without a valid frontmatter', async () => {
    const source = join(root, 'source');
    const target = join(root, 'target');
    await mkdir(join(source, 'invalid'), { recursive: true });
    await writeFile(join(source, 'invalid', 'SKILL.md'), '# no frontmatter');
    await expect(syncBuiltinSkills({ sourceDir: source, destinationDir: target })).resolves.toEqual(
      []
    );
  });
});
