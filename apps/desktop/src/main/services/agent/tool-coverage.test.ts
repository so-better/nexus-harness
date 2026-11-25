/**
 * 工具自动注入覆盖测试：用真实 AgentService + mock 模型，逐工具验证代表性请求能否命中注入。
 * mock 重排会优先选择当前用例期望的工具（模拟"模型从召回里正确挑选"），从而测量召回层覆盖。
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChatMessage, ChatProvider, ProviderRequest } from '@nexus/providers';
import type { ImageSettings } from '@shared/image';
import type { SearchSettings } from '@shared/search';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../storage/database';
import type { McpService } from '../mcp/mcp-service';
import type { SkillService } from '../skills/skill-service';
import { AgentService } from './agent-service';

interface ToolCase {
  prompt: string;
  tool: string;
}

/**
 * 常驻 core 工具：任何请求都应注入。
 */
const CORE_TOOLS = [
  'read_file',
  'list_dir',
  'write_file',
  'apply_patch',
  'run_command',
  'glob',
  'grep',
  'ask_user',
  'search_tools',
  'read_artifact',
  'open_url',
  'save_file',
  'web_search',
  'web_fetch',
  'memory_search',
  'memory_read',
  'search_knowledge',
  'search_skills',
  'read_skill',
  'read_skill_file',
  'run_skill_script'
];

const CASES: ToolCase[] = [
  // 网络 / 媒体
  { prompt: '联网搜索 TypeScript 最新版本发布说明', tool: 'web_search' },
  { prompt: '今天北京天气怎么样，需要实时信息', tool: 'web_search' },
  { prompt: '读取这个网页的正文 https://example.com/article', tool: 'web_fetch' },
  { prompt: '从图库搜索城市夜景的图片素材', tool: 'search_images' },
  { prompt: '搜索一段海浪的视频素材', tool: 'search_videos' },
  { prompt: '帮我生成一张赛博朋克风格的城市图片', tool: 'generate_image' },
  // 办公文档
  { prompt: '把这份纪要保存成 Word 文档', tool: 'save_word' },
  { prompt: '生成一个 Excel 表格记录这些数据', tool: 'save_excel' },
  { prompt: '帮我做一份 PPT 汇报', tool: 'save_ppt' },
  { prompt: '把这些内容导出成 PDF', tool: 'save_pdf' },
  // 终端
  { prompt: '读取终端当前的字体大小和滚回设置', tool: 'terminal_get_settings' },
  { prompt: '更新一下终端设置，字号改成 14', tool: 'terminal_update_settings' },
  { prompt: '列出当前会话有哪些终端', tool: 'terminal_list' },
  { prompt: '新建一个交互式终端', tool: 'terminal_create' },
  { prompt: '请求授权你读取我的终端', tool: 'terminal_request_access' },
  { prompt: '读取 terminal-1 的终端输出', tool: 'terminal_read' },
  { prompt: '等待终端出现 done 输出', tool: 'terminal_wait' },
  { prompt: '往终端写入文本并回车', tool: 'terminal_write' },
  { prompt: '关闭这个终端', tool: 'terminal_close' },
  // 外观
  { prompt: '现在用的是什么主题', tool: 'theme_get' },
  { prompt: '把主题切换成深色', tool: 'theme_update' },
  { prompt: '列出可用的皮肤', tool: 'skin_list' },
  { prompt: '应用极光皮肤', tool: 'skin_apply' },
  // 维护
  { prompt: '看看缓存占用了多少空间', tool: 'cache_get_info' },
  { prompt: '清理一下缓存', tool: 'cache_clear' },
  { prompt: '查看备份状态', tool: 'backup_status' },
  { prompt: '导出完整数据备份', tool: 'backup_export' },
  { prompt: '导入这个备份文件', tool: 'backup_import' },
  { prompt: '查看语言和开机自启设置', tool: 'general_settings_get' },
  { prompt: '修改语言为英文', tool: 'general_settings_update' },
  { prompt: '列出生图模型配置', tool: 'image_config_list' },
  { prompt: '读取那个生图模型配置', tool: 'image_config_get' },
  { prompt: '新建一个生图模型配置', tool: 'image_config_save' },
  { prompt: '启用这个生图模型', tool: 'image_config_toggle' },
  { prompt: '删除这个生图模型配置', tool: 'image_config_delete' },
  // 插件
  { prompt: '列出已安装的插件', tool: 'plugin_list' },
  { prompt: '读取这个插件的 manifest', tool: 'plugin_read' },
  { prompt: '重新加载插件', tool: 'plugin_reload' },
  { prompt: '启用这个插件', tool: 'plugin_set_enabled' },
  { prompt: '删除这个插件', tool: 'plugin_delete' },
  { prompt: '从目录导入插件', tool: 'plugin_import' },
  { prompt: '帮我写一个插件', tool: 'plugin_write' },
  // Skill 管理
  { prompt: '列出已安装的技能', tool: 'skill_list' },
  { prompt: '重新扫描技能目录', tool: 'skill_refresh' },
  { prompt: '从目录导入一个技能', tool: 'skill_import' },
  { prompt: '创建一个新技能', tool: 'skill_create' },
  { prompt: '修改这个技能', tool: 'skill_update' },
  { prompt: '删除这个技能', tool: 'skill_delete' },
  // MCP 管理
  { prompt: '列出当前的 MCP 服务器', tool: 'mcp_list' },
  { prompt: '读取 MCP 配置', tool: 'mcp_read' },
  { prompt: '更新这个 MCP 服务器配置', tool: 'mcp_update' },
  { prompt: '保存这份 MCP 配置', tool: 'mcp_save' },
  { prompt: '重新连接 MCP 服务器', tool: 'mcp_refresh' },
  { prompt: '测试这个 MCP 配置', tool: 'mcp_test' }
];

const candidateNamesFromRerankPrompt = (content: string): string[] => {
  const marker = '候选工具：';
  const index = content.indexOf(marker);
  if (index < 0) return [];
  const names: string[] = [];
  for (const line of content.slice(index + marker.length).split('\n')) {
    const match = line.match(/^([^\s—]+)\s—\s/);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
};

describe('tool coverage', () => {
  let root = '';
  let service: AgentService;
  let currentExpected: string[] = [];
  const mainToolSets: string[][] = [];

  const provider: ChatProvider = {
    capabilities: { streaming: true, toolCalling: true, vision: false, reasoning: false },
    async *stream(request: ProviderRequest) {
      if (!request.tools?.length) {
        // 重排调用：优先挑选当前用例期望的工具（模拟模型从召回里选中正确工具）
        const lastUser = [...request.messages]
          .reverse()
          .find((m: ChatMessage) => m.role === 'user');
        const candidates = candidateNamesFromRerankPrompt(lastUser?.content ?? '');
        const preferred = currentExpected.filter((name) => candidates.includes(name));
        const rest = candidates.filter((name) => !currentExpected.includes(name));
        const picked = [...preferred, ...rest].slice(0, 10);
        yield { type: 'text-delta', text: JSON.stringify(picked) };
        yield { type: 'finish', reason: 'stop' };
        return;
      }
      mainToolSets.push(request.tools.map((tool) => tool.name));
      yield { type: 'text-delta', text: 'ok' };
      yield { type: 'finish', reason: 'stop' };
    }
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'nexus-tool-coverage-'));
    const database = createDatabase(join(root, 'nexus.db'));
    const skills = {
      list: () => [],
      search: () => [],
      read: async () => undefined
    } as unknown as SkillService;
    const mcp = {
      listTools: async () => [
        {
          name: 'mcp_demo_search',
          description: 'demo search tool',
          permission: 'execute' as const,
          requiresApproval: true,
          inputSchema: { type: 'object', properties: {} }
        }
      ],
      prewarm: async () => undefined
    } as unknown as McpService;
    const imageSettings = async (): Promise<ImageSettings> => ({
      configs: [
        {
          id: 'image-demo',
          name: 'Demo Image',
          model: 'image-model',
          enabled: true,
          template: { url: 'https://example.com/image' }
        }
      ]
    });
    const searchSettings = async (): Promise<SearchSettings> => ({
      pexelsApiKey: 'pexels-key',
      anysearchApiKey: 'any-key'
    });
    service = new AgentService({
      createProvider: () => provider,
      database,
      skills,
      mcp,
      imageSettings,
      searchSettings,
      generalSettings: {}
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('always injects the core tool set and nothing extra for a trivial prompt', async () => {
    currentExpected = [];
    mainToolSets.length = 0;
    await service.run(
      {
        sessionId: 'coverage-core',
        prompt: '你好',
        rootPaths: [],
        providerId: 'provider-coverage',
        modelId: 'model-coverage'
      },
      {
        id: 'provider-coverage',
        protocol: 'openai' as const,
        name: 'Coverage Provider',
        baseUrl: 'https://example.com/v1',
        models: [{ id: 'model-coverage', contextWindow: 128_000, maxOutputTokens: 4_096 }],
        defaultModelId: 'model-coverage',
        apiKey: 'secret',
        enabled: true
      }
    );
    const injected = (mainToolSets.at(-1) ?? []).slice().sort();
    expect(injected).toEqual([...CORE_TOOLS].sort());
  });

  it('auto-injects each optional built-in tool for a fitting prompt', async () => {
    const misses: string[] = [];
    for (const testCase of CASES) {
      currentExpected = [testCase.tool];
      mainToolSets.length = 0;
      await service.run(
        {
          sessionId: `coverage-${testCase.tool}`,
          prompt: testCase.prompt,
          rootPaths: [],
          providerId: 'provider-coverage',
          modelId: 'model-coverage'
        },
        {
          id: 'provider-coverage',
          protocol: 'openai' as const,
          name: 'Coverage Provider',
          baseUrl: 'https://example.com/v1',
          models: [{ id: 'model-coverage', contextWindow: 128_000, maxOutputTokens: 4_096 }],
          defaultModelId: 'model-coverage',
          apiKey: 'secret',
          enabled: true
        }
      );
      const injected = mainToolSets.at(-1) ?? [];
      if (!injected.includes(testCase.tool)) {
        misses.push(`${testCase.tool} ← "${testCase.prompt}"`);
      }
    }

    if (misses.length) {
      console.warn(`工具覆盖率缺口（${misses.length}/${CASES.length}）：\n${misses.join('\n')}`);
    } else {
      console.warn(`工具覆盖率：${CASES.length}/${CASES.length} 全部命中`);
    }
    expect(misses).toEqual([]);
  });
});
