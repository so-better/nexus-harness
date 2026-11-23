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
