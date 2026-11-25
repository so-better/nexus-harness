// @vitest-environment node
/**
 * 内置 MCP 模板：补齐缺失 Server，但不覆盖用户已有配置。
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncBuiltinMcpConfig } from './builtin-mcp-service';

describe('syncBuiltinMcpConfig', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-builtin-mcp-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('adds missing built-in servers and preserves user entries', async () => {
    const source = join(root, 'builtin.json');
    const target = join(root, 'mcp');
    await mkdir(target, { recursive: true });
    await writeFile(
      source,
      JSON.stringify({
        mcpServers: {
          playwright: { command: 'npx', args: ['@playwright/mcp@1'] },
          browserUse: { command: 'uvx', args: ['browser-use'] }
        }
      })
    );
    await writeFile(
      join(target, 'mcp.json'),
      JSON.stringify({ mcpServers: { custom: { command: 'node', args: ['server.js'] } } })
    );
    await expect(syncBuiltinMcpConfig(source, target)).resolves.toEqual([
      'playwright',
      'browserUse'
    ]);
    const saved = JSON.parse(await readFile(join(target, 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(saved.mcpServers.custom).toBeDefined();
    expect(saved.mcpServers.playwright).toBeDefined();
    expect(saved.mcpServers.browserUse).toBeDefined();

    await expect(syncBuiltinMcpConfig(source, target)).resolves.toEqual([]);
  });

  it('ships a valid disabled built-in template set', async () => {
    const raw = JSON.parse(
      await readFile(join(process.cwd(), 'apps/desktop/resources/mcp/mcp.json'), 'utf8')
    ) as { mcpServers: Record<string, { enabled?: boolean }> };
    expect(Object.keys(raw.mcpServers)).toEqual(['playwright', 'context7', 'deepwiki']);
    expect(Object.values(raw.mcpServers).every((server) => server.enabled === true)).toBe(true);
  });

  it('removes a retired built-in server when it is untouched', async () => {
    const source = join(root, 'builtin.json');
    const target = join(root, 'mcp');
    await mkdir(target, { recursive: true });
    await writeFile(
      source,
      JSON.stringify({
        mcpServers: { playwright: { command: 'npx', args: ['@playwright/mcp@1'] } }
      })
    );
    await writeFile(
      join(target, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'browser-use': {
            type: 'stdio',
            command: 'uvx',
            args: ['--from', 'browser-use==1.0.6', 'browser-use', '--cli-mcp'],
            enabled: true
          },
          'microsoft-learn': {
            type: 'http',
            url: 'https://learn.microsoft.com/api/mcp',
            enabled: true
          },
          custom: { command: 'node', args: ['server.js'] }
        }
      })
    );

    await expect(syncBuiltinMcpConfig(source, target)).resolves.toEqual(['playwright']);
    const saved = JSON.parse(await readFile(join(target, 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(saved.mcpServers['browser-use']).toBeUndefined();
    expect(saved.mcpServers['microsoft-learn']).toBeUndefined();
    expect(saved.mcpServers.custom).toBeDefined();
    expect(saved.mcpServers.playwright).toBeDefined();
  });

  it('keeps a retired built-in server that the user modified', async () => {
    const source = join(root, 'builtin.json');
    const target = join(root, 'mcp');
    await mkdir(target, { recursive: true });
    await writeFile(source, JSON.stringify({ mcpServers: {} }));
    await writeFile(
      join(target, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'browser-use': {
            type: 'stdio',
            command: 'uvx',
            args: ['--from', 'browser-use==2.0.0', 'browser-use', '--cli-mcp'],
            enabled: false
          }
        }
      })
    );

    await expect(syncBuiltinMcpConfig(source, target)).resolves.toEqual([]);
    const saved = JSON.parse(await readFile(join(target, 'mcp.json'), 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(saved.mcpServers['browser-use']).toBeDefined();
  });

  it('preserves an invalid existing config instead of overwriting it', async () => {
    const source = join(root, 'builtin.json');
    const target = join(root, 'mcp');
    await mkdir(target, { recursive: true });
    const invalid = '{ not json';
    await writeFile(source, JSON.stringify({ mcpServers: { bad: { command: 42 } } }));
    await writeFile(join(target, 'mcp.json'), invalid);
    const saved = await syncBuiltinMcpConfig(source, target);
    expect(saved).toEqual([]);
    expect(await readFile(join(target, 'mcp.json'), 'utf8')).toBe(invalid);
  });
});
