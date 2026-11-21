// @vitest-environment node
/**
 * MCP 管理工具：脱敏读取、保存密钥恢复、刷新与测试。
 */
import { describe, expect, it, vi } from 'vitest';
import type { McpService } from '../mcp/mcp-service';
import { executeMcpTool } from './mcp-tools';

const current = JSON.stringify({
  mcpServers: {
    demo: {
      command: 'npx',
      args: ['server'],
      env: { SECRET: 'real-secret' },
      headers: { Authorization: 'Bearer old-token', Accept: 'application/json' }
    }
  }
});

const makeService = () => {
  const readRaw = vi.fn(async () => current);
  const saveRaw = vi.fn(async () => undefined);
  const getStatus = vi.fn(async () => [{ id: 'demo', enabled: true, connected: false, tools: 0 }]);
  const dispose = vi.fn(async () => undefined);
  const prewarm = vi.fn(async () => undefined);
  const testRaw = vi.fn(async () => ({ results: [{ id: 'demo', ok: true }] }));
  return {
    service: { readRaw, saveRaw, getStatus, dispose, prewarm, testRaw } as unknown as McpService,
    readRaw,
    saveRaw,
    getStatus,
    dispose,
    prewarm,
    testRaw
  };
};

describe('mcp tools', () => {
  it('redacts secret values when reading config', async () => {
    const mocks = makeService();
    const result = await executeMcpTool('mcp_read', {}, { service: mocks.service });
    expect(result.ok).toBe(true);
    const raw = JSON.parse(result.output).raw as string;
    expect(raw).not.toContain('real-secret');
    expect(raw).not.toContain('old-token');
    expect(raw).toContain('••••');
    expect(raw).toContain('application/json');
  });

  it('restores masked secrets when saving and testing', async () => {
    const mocks = makeService();
    const redacted = JSON.stringify({
      mcpServers: {
        demo: {
          command: 'npx',
          args: ['server'],
          env: { SECRET: '••••' },
          headers: { Authorization: '••••' }
        }
      }
    });
    const saved = await executeMcpTool('mcp_save', { raw: redacted }, { service: mocks.service });
    expect(saved.ok).toBe(true);
    expect(mocks.saveRaw).toHaveBeenCalledWith(expect.stringContaining('real-secret'));
    expect(mocks.saveRaw).toHaveBeenCalledWith(expect.stringContaining('Bearer old-token'));

    const tested = await executeMcpTool('mcp_test', { raw: redacted }, { service: mocks.service });
    expect(tested.ok).toBe(true);
    expect(mocks.testRaw).toHaveBeenCalledWith(expect.stringContaining('real-secret'));
  });

  it('restores masks when updating a single server', async () => {
    const mocks = makeService();
    const updated = await executeMcpTool(
      'mcp_update',
      {
        id: 'demo',
        enabled: false,
        config: { headers: { Authorization: '••••', Accept: 'text/plain' } }
      },
      { service: mocks.service }
    );
    expect(updated.ok).toBe(true);
    expect(mocks.saveRaw).toHaveBeenCalledWith(expect.stringContaining('Bearer old-token'));
    expect(mocks.saveRaw).toHaveBeenCalledWith(expect.stringContaining('text/plain'));
    expect(mocks.saveRaw).toHaveBeenCalledWith(expect.stringContaining('"enabled": false'));
  });

  it('lists status, refreshes and rejects new masked keys', async () => {
    const mocks = makeService();
    const listed = await executeMcpTool('mcp_list', {}, { service: mocks.service });
    expect(JSON.parse(listed.output).servers).toHaveLength(1);

    const refreshed = await executeMcpTool('mcp_refresh', {}, { service: mocks.service });
    expect(refreshed.ok).toBe(true);
    expect(mocks.dispose).toHaveBeenCalled();
    expect(mocks.prewarm).toHaveBeenCalled();

    const invalid = await executeMcpTool(
      'mcp_save',
      {
        raw: JSON.stringify({
          mcpServers: { demo: { command: 'npx', env: { NEW_SECRET: '••••' } } }
        })
      },
      { service: mocks.service }
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'MCP_SAVE_FAILED' } });
  });
});
