/**
 * 文件工具集：把各独立文件工具绑定到授权 roots。
 */

import { realpath } from 'node:fs/promises';
import { isSensitivePath } from '@nexus/runtime-utils';
import { readFileToolDefinition, runReadFileTool } from './read-file';
import { listDirToolDefinition, runListDirTool } from './list-dir';
import { writeFileToolDefinition, runWriteFileTool } from './write-file';
import { applyPatchToolDefinition, runApplyPatchTool } from './apply-patch';
import { runCommandToolDefinition, runRunCommandTool } from './run-command';
import { globToolDefinition, runGlobTool } from './glob';
import { grepToolDefinition, runGrepTool } from './grep';
import {
  FileToolError,
  resolveForWrite,
  resolveWithinRoots,
  type FileToolContext,
  type FileToolDefinition,
  type FileToolResult,
  type FileToolset
} from '../internal';

const tools = {
  read_file: { definition: readFileToolDefinition, run: runReadFileTool },
  list_dir: { definition: listDirToolDefinition, run: runListDirTool },
  write_file: { definition: writeFileToolDefinition, run: runWriteFileTool },
  apply_patch: { definition: applyPatchToolDefinition, run: runApplyPatchTool },
  run_command: { definition: runCommandToolDefinition, run: runRunCommandTool },
  glob: { definition: globToolDefinition, run: runGlobTool },
  grep: { definition: grepToolDefinition, run: runGrepTool }
} as const;

/**
 * 文件工具定义；无工作区时也注入 schema，首次调用再请求授权。
 */
export const fileToolDefinitions: FileToolDefinition[] = Object.values(tools).map(
  (item) => item.definition
);

/**
 * 创建绑定到 roots 的文件工具集；shell 为执行命令使用的可选 shell 路径。
 */
export const createFileToolset = async (
  rootPaths: readonly string[],
  options: { shell?: string | null } = {}
): Promise<FileToolset> => {
  if (rootPaths.length === 0) throw new Error('至少需要一个授权 root');
  const settled = await Promise.allSettled(rootPaths.map((root) => realpath(root)));
  const roots = settled
    .filter((item): item is PromiseFulfilledResult<string> => item.status === 'fulfilled')
    .map((item) => item.value)
    .filter((root) => !isSensitivePath(root));
  const primaryRoot = roots[0];
  if (!primaryRoot) throw new Error('没有可用的授权 root');

  const context: FileToolContext = {
    roots,
    primaryRoot,
    ...(options.shell ? { shell: options.shell } : {})
  };
  const definitions = Object.values(tools).map((item) => item.definition);

  const execute = async (name: string, input: unknown): Promise<FileToolResult> => {
    const tool = tools[name as keyof typeof tools];
    if (!tool) {
      return {
        ok: false,
        output: '',
        error: { code: 'TOOL_NOT_FOUND', message: `未知工具：${name}` }
      };
    }
    try {
      return await tool.run(context, input);
    } catch (error) {
      if (error instanceof FileToolError) {
        return { ok: false, output: '', error: { code: error.code, message: error.message } };
      }
      if (error instanceof Error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) {
          return {
            ok: false,
            output: '',
            error: {
              code: code === 'ENOENT' ? 'FILE_NOT_FOUND' : code,
              message: error.message
            }
          };
        }
      }
      return {
        ok: false,
        output: '',
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
  };

  const resolvePath: FileToolset['resolvePath'] = async (target, options = {}) =>
    options.mode === 'write'
      ? resolveForWrite(roots, primaryRoot, target, options.createDirs ?? false)
      : resolveWithinRoots(roots, primaryRoot, target);

  return { definitions, execute, resolvePath };
};

export { runCommandInputSchema } from './run-command';
export type { FileToolDefinition, FileToolResult, FileToolset } from '../internal';
