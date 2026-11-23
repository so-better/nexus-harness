/**
 * MCP 工具调用测试：净化后的工具名能正确分发回原始 Server 工具名。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  listResources: vi.fn(),
  listPrompts: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  transport: vi.fn()
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mocks.connect;
    listTools = mocks.listTools;
    listResources = mocks.listResources;
    listPrompts = mocks.listPrompts;
    callTool = mocks.callTool;
    close = mocks.close;
  }
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor(...args: unknown[]) {
      mocks.transport(...args);
    }
  }
}));

import { McpService } from './mcp-service';

describe('McpService tool calls', () => {
  let root = '';
  let service: McpService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-mcp-call-'));
    service = new McpService(root);
    mocks.connect.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue({
      tools: [{ name: 'read.file', description: 'Read a file', inputSchema: { type: 'object' } }]
    });
    mocks.listResources.mockResolvedValue({ resources: [] });
    mocks.listPrompts.mockResolvedValue({ prompts: [] });
    mocks.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      isError: false
    });
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({ mcpServers: { demo: { command: 'node', args: [] } } })
    );
  });

  afterEach(async () => {
    await service.dispose();
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('runs stdio servers in a writable userData workdir', async () => {
    await service.listTools();
    expect(mocks.transport).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: join(root, 'workdir')
      })
    );
  });

  it('prepares uvx dependencies automatically with offline-first fallback', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { demo: { command: 'uvx', args: ['--from', 'demo-package', 'demo'] } }
      })
    );
    mocks.connect
      .mockRejectedValueOnce(new Error('No solution found when resolving tool dependencies'))
      .mockRejectedValueOnce(new Error('Because demo was not found in the cache'))
      .mockResolvedValue(undefined);

    await service.listTools();

    expect(mocks.transport).toHaveBeenCalledTimes(3);
    const appOffline = mocks.transport.mock.calls[0]?.[0] as { env: Record<string, string> };
    const userOffline = mocks.transport.mock.calls[1]?.[0] as { env: Record<string, string> };
    const online = mocks.transport.mock.calls[2]?.[0] as { env: Record<string, string> };
    expect(appOffline.env['UV_OFFLINE']).toBe('1');
    expect(appOffline.env['UV_CACHE_DIR']).toBe(join(root, 'cache', 'uv'));
    expect(userOffline.env['UV_OFFLINE']).toBe('1');
    expect(userOffline.env['UV_CACHE_DIR']).toBeUndefined();
    expect(online.env['UV_OFFLINE']).toBeUndefined();
    expect(online.env['UV_CACHE_DIR']).toBe(join(root, 'cache', 'uv'));
  });

  it('does not retry non-cache uvx failures', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { demo: { command: 'uvx', args: ['--from', 'demo-package', 'demo'] } }
      })
    );
    mocks.connect.mockRejectedValue(new Error('spawn uvx ENOENT'));

    await service.listTools();

    expect(mocks.transport).toHaveBeenCalledTimes(1);
  });

  it('exposes preparing status while the online dependency step is running', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { demo: { command: 'uvx', args: ['--from', 'demo-package', 'demo'] } }
      })
    );
    let finishOnline: (() => void) | undefined;
    mocks.connect
      .mockRejectedValueOnce(new Error('No solution found when resolving tool dependencies'))
      .mockRejectedValueOnce(new Error('Because demo was not found in the cache'))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishOnline = resolve;
          })
      );

    const running = service.listTools();
    await vi.waitFor(() => expect(mocks.transport).toHaveBeenCalledTimes(3));
    await expect(service.getStatus()).resolves.toContainEqual(
      expect.objectContaining({ id: 'demo', preparing: true })
    );

    finishOnline?.();
    await running;
    const settled = await service.getStatus();
    expect(settled.find((item) => item.id === 'demo')?.preparing).toBeUndefined();
  });

  it('resolves a configured stdio cwd relative to the MCP directory', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: { demo: { command: 'node', args: [], cwd: 'custom-workdir' } }
      })
    );
    await service.listTools();
    expect(mocks.transport).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: join(root, 'custom-workdir') })
    );
  });

  it('routes sanitized public names back to the original MCP tool name', async () => {
    const tools = await service.listTools();
    expect(tools.map((tool) => tool.name)).toContain('mcp_demo_read_file');

    const result = await service.call('mcp_demo_read_file', {});
    expect(result.ok).toBe(true);
    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'read.file',
      arguments: {}
    });
  });

  it('prewarms enabled servers and reuses the same connections', async () => {
    await service.prewarm();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    await expect(service.getStatus()).resolves.toContainEqual(
      expect.objectContaining({ id: 'demo', connected: true, tools: 1 })
    );
    await service.listTools();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('connects enabled servers concurrently', async () => {
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          one: { command: 'node', args: [] },
          two: { command: 'node', args: [] }
        }
      })
    );
    const pending: Array<() => void> = [];
    mocks.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        })
    );

    const tools = service.listTools();
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(2));
    for (const resolve of pending) resolve();
    await expect(tools).resolves.toHaveLength(2);
  });

  it('stops waiting for shared prewarm when the run is aborted', async () => {
    const pending: Array<() => void> = [];
    mocks.connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        })
    );
    const prewarm = service.prewarm();
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    const controller = new AbortController();
    const tools = service.listTools(controller.signal);
    controller.abort();
    await expect(tools).resolves.toEqual([]);

    pending[0]?.();
    await prewarm;
  });

  it('skips failed servers during the retry cooldown', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('connection failed'));
    await service.listTools();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    await service.listTools();
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    await service.saveRaw(JSON.stringify({ mcpServers: { demo: { command: 'node', args: [] } } }));
    await service.listTools();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it('closes a server after it is disabled', async () => {
    await service.listTools();
    await writeFile(
      join(root, 'mcp.json'),
      JSON.stringify({ mcpServers: { demo: { command: 'node', args: [], enabled: false } } })
    );
    await expect(service.listTools()).resolves.toEqual([]);
    expect(mocks.close).toHaveBeenCalled();
  });
});
