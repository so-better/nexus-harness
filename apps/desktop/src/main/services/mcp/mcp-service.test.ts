/**
 * MCP 配置测试：标准 mcpServers 读取、保存与逐 Server 测试结果。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpService, mcpToolAlias } from './mcp-service';

describe('McpService config', () => {
  let root = '';
  let service: McpService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-mcp-'));
    service = new McpService(root);
  });

  afterEach(async () => {
    await service.dispose();
    await rm(root, { recursive: true, force: true });
  });

  it('reads standard mcpServers configs', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          demo: { command: 'node', args: ['server.js'] },
          remote: { url: 'https://example.com/mcp' }
        }
      })
    );
    const configs = await service.listConfigs();
    expect(configs.find((config) => config.id === 'demo')?.transport).toBe('stdio');
    expect(configs.find((config) => config.id === 'remote')?.transport).toBe('http');
  });

  it('saves raw JSON and reports invalid servers independently', async () => {
    await service.saveRaw(JSON.stringify({ mcpServers: { demo: { command: 'node', args: [] } } }));
    const raw = await service.readRaw();
    expect(raw).toContain('"demo"');

    const result = await service.testRaw(
      JSON.stringify({ mcpServers: { broken: { command: 42 } } })
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ id: 'broken', ok: false });
  });

  it('does not load disabled servers into the Agent tools', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { disabled: { command: 'missing-command', enabled: false } }
      })
    );
    await expect(service.listTools()).resolves.toEqual([]);
  });

  it('marks disabled servers as skipped during testing', async () => {
    const result = await service.testRaw(
      JSON.stringify({ mcpServers: { disabled: { command: 'missing-command', enabled: false } } })
    );
    expect(result.results[0]).toMatchObject({ id: 'disabled', ok: true, skipped: true });
  });

  it('reports disabled servers in status without connecting', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({ mcpServers: { disabled: { command: 'missing-command', enabled: false } } })
    );
    await expect(service.getStatus()).resolves.toEqual([
      { id: 'disabled', enabled: false, connected: false, tools: 0 }
    ]);
  });

  it('persists startup errors across service instances', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { broken: { command: 'definitely-not-a-nexus-mcp-command', args: [] } }
      })
    );
    const first = new McpService(root);
    await first.listTools();
    await first.dispose();

    const second = new McpService(root);
    const status = await second.getStatus();
    expect(status[0]).toMatchObject({ id: 'broken', enabled: true, connected: false });
    expect(status[0]?.error).toContain('ENOENT');
  }, 20_000);

  it('sanitizes MCP tool names to provider-safe aliases', () => {
    expect(mcpToolAlias('filesystem', 'read.file')).toBe('mcp_filesystem_read_file');
    expect(mcpToolAlias('server.with.dot', 'tool:name')).toBe('mcp_server_with_dot_tool_name');
    expect(mcpToolAlias('server', 'x'.repeat(80))).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });
});
