/**
 * Skill 扫描与按需读取测试。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SkillBuiltinDeleteError, SkillService } from './skill-service';

describe('SkillService', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-skills-'));
    await mkdir(join(root, 'fix-tests'), { recursive: true });
    await writeFile(
      join(root, 'fix-tests', 'SKILL.md'),
      '---\nname: fix-failing-tests\ndescription: 修复失败测试\ntags: [测试, lint]\nversion: 1.2.0\nrequires: [read, write]\n---\n先运行测试，再定位失败。\n'
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('scans metadata without loading full content into search results', async () => {
    const skills = await new SkillService(root).scan();
    expect(skills[0]).toMatchObject({ id: 'fix-tests', name: 'fix-failing-tests' });
    expect(JSON.stringify(await new SkillService(root).search('测试'))).not.toContain('先运行');
  });

  it('reads a skill by its frontmatter name', async () => {
    const skill = await new SkillService(root).read('fix-failing-tests');
    expect(skill?.id).toBe('fix-tests');
    expect(skill?.content).toContain('先运行测试');
  });

  it('skips user skills with invalid frontmatter names', async () => {
    await mkdir(join(root, 'invalid-skill'), { recursive: true });
    await writeFile(
      join(root, 'invalid-skill', 'SKILL.md'),
      '---\nname: Code Review\ndescription: invalid\n---\nBody\n'
    );
    const skills = await new SkillService(root).scan();
    expect(skills.map((skill) => skill.id)).not.toContain('invalid-skill');
  });

  it('marks skills that exist under resources/skills as builtin and protects them from deletion', async () => {
    await mkdir(join(root, 'bundled-skill'), { recursive: true });
    await writeFile(
      join(root, 'bundled-skill', 'SKILL.md'),
      '---\nname: bundled-skill\ndescription: bundled\n---\nBody\n'
    );
    const builtinRoot = await mkdtemp(join(tmpdir(), 'nexus-builtin-source-'));
    const source = await mkdtemp(join(tmpdir(), 'nexus-skill-source-'));
    try {
      await mkdir(join(builtinRoot, 'bundled-skill'), { recursive: true });
      const service = new SkillService(root, builtinRoot);
      expect(await service.scan()).toContainEqual(
        expect.objectContaining({ id: 'bundled-skill', source: 'builtin' })
      );
      expect((await service.read('bundled-skill'))?.source).toBe('builtin');
      await expect(service.delete('bundled-skill')).rejects.toBeInstanceOf(
        SkillBuiltinDeleteError
      );
      await writeFile(
        join(source, 'SKILL.md'),
        '---\nname: imported-bundled\ndescription: imported\n---\nBody\n'
      );
      await service.importDirectory(source);
      expect((await service.read('imported-bundled'))?.source).toBe('user');
      await writeFile(
        join(source, 'SKILL.md'),
        '---\nname: bundled-skill\ndescription: overridden builtin\n---\nBody\n'
      );
      await expect(service.importDirectory(source)).rejects.toThrow(
        '不能导入与内置 SKILL 同名'
      );
    } finally {
      await rm(builtinRoot, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it('reads tags, version and requires from metadata', async () => {
    await mkdir(join(root, 'metadata-skill'), { recursive: true });
    await writeFile(
      join(root, 'metadata-skill', 'SKILL.md'),
      '---\nname: metadata-skill\ndescription: metadata demo\nmetadata:\n  tags: [demo, metadata]\n  version: 2.0.0\n  requires: [read, execute]\n---\nBody\n'
    );
    const skill = await new SkillService(root).read('metadata-skill');
    expect(skill).toMatchObject({
      tags: ['demo', 'metadata'],
      version: '2.0.0',
      requires: ['read', 'execute']
    });
  });

  it('runs a script inside the Skill scripts directory', async () => {
    await mkdir(join(root, 'fix-tests', 'scripts'), { recursive: true });
    await writeFile(join(root, 'fix-tests', 'scripts', 'echo.js'), "console.log('skill-ok')");
    const service = new SkillService(root);
    const result = await service.runScript('fix-failing-tests', 'echo.js');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('skill-ok');
    await expect(service.readFile('fix-failing-tests', 'scripts/echo.js')).resolves.toContain(
      'skill-ok'
    );
  }, 10_000);

  it('imports a directory with SKILL.md and resources', async () => {
    const source = await mkdtemp(join(tmpdir(), 'nexus-skill-source-'));
    try {
      await mkdir(join(source, 'assets'), { recursive: true });
      await writeFile(
        join(source, 'SKILL.md'),
        '---\nname: imported-skill\ndescription: imported\n---\nBody\n'
      );
      await writeFile(join(source, 'assets', 'note.txt'), 'asset');
      const service = new SkillService(root);
      const list = await service.importDirectory(source);
      expect(list.some((skill) => skill.id === 'imported-skill')).toBe(true);
      expect((await service.read('imported-skill'))?.assets).toContain('note.txt');
      await expect(service.readFile('imported-skill', 'assets/note.txt')).resolves.toBe('asset');
    } finally {
      await rm(source, { recursive: true, force: true });
    }
  });

  it('reads the body and rejects traversal', async () => {
    const service = new SkillService(root);
    const skill = await service.read('fix-tests');
    expect(skill?.content).toContain('先运行测试');
    await expect(service.read('../outside')).resolves.toBeUndefined();
  });
});
