/**
 * 全局记忆服务：CRUD、归档与上下文注入。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import { MemoryService } from './memory-service';

describe('MemoryService', () => {
  let directory = '';
  let service: MemoryService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexus-memory-'));
    service = new MemoryService(createDatabase(join(directory, 'nexus.db')));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates, lists and injects active global memories', () => {
    const created = service.create({
      title: '回答风格',
      content: '偏好简洁中文回答。',
      kind: 'preference'
    });
    expect(created).toMatchObject({ status: 'active' });
    expect(service.list()).toHaveLength(1);
    expect(service.context().text).toContain('偏好简洁中文回答');
    expect(service.context().text).toContain('<memory>');
  });

  it('updates, archives and removes memories', () => {
    const created = service.create({
      title: '包管理器',
      content: '优先使用 pnpm。',
      kind: 'fact'
    });
    const updated = service.update({
      id: created.id,
      content: '优先使用 pnpm 和 workspace。'
    });
    expect(updated?.content).toContain('workspace');
    expect(updated?.status).toBe('active');
    expect(service.context().text).toContain('workspace');
    expect(service.remove(created.id)).toBe(true);
    expect(service.remove(created.id)).toBe(false);
    expect(service.list()).toHaveLength(0);
  });

  it('creates proposed candidates that are excluded from context', () => {
    const proposed = service.propose({
      title: '回答风格',
      content: '偏好简洁中文回答。',
      kind: 'preference'
    });
    expect(proposed).toMatchObject({ status: 'proposed' });
    expect(service.context().text).toBe('');
    service.update({ id: proposed!.id, status: 'active' });
    expect(service.context().text).toContain('简洁中文回答');
  });

  it('rejects obvious secrets', () => {
    expect(() =>
      service.create({
        title: 'API key',
        content: 'api_key = sk-abcdefghijklmnopqrstuvwxyz123456',
        kind: 'fact'
      })
    ).toThrow('疑似密钥或密码');
  });

  it('limits injected context and records last use', () => {
    const created = service.create({
      title: '长期方向',
      content: '保持本地优先和可审计。',
      kind: 'decision'
    });
    const context = service.context();
    service.touch(context.ids);
    expect(service.list()[0]?.lastUsedAt).toBeTypeOf('number');
    expect(context.ids).toEqual([created.id]);
  });
});
