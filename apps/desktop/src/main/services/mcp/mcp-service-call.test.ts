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
});
