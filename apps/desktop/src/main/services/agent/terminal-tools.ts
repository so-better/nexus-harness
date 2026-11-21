/**
 * 终端工具：读取/更新终端配置，以及新建、列出和关闭终端。
 */
import { realpath, stat } from 'node:fs/promises';
import { sep } from 'node:path';
import { z } from 'zod';
import { detectDangerousCommand } from '@nexus/runtime-utils';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import {
  terminalSettingsSchema,
  type TerminalSessionPublic,
  type TerminalSettings
} from '@shared/ipc/contracts';
import { terminalService } from '../terminal/terminal-service';
import { loadTerminalSettings } from '../settings/terminal-settings';
import { applyTerminalSettings } from '../settings/terminal-settings-service';

export interface TerminalToolOptions {
  sessionId: string;
  ownerId?: number;
  rootPaths?: readonly string[];
  settingsDir?: string;
  signal?: AbortSignal;
}

const getSettingsSchema = z.object({}).strict();
const updateSettingsSchema = terminalSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '至少需要一个设置项' });
const listSchema = z.object({}).strict();
const createSchema = z
  .object({
    cwd: z.string().min(1).optional(),
    cols: z.number().int().min(2).max(500).optional(),
    rows: z.number().int().min(1).max(300).optional()
  })
  .strict();
const closeSchema = z.object({ terminalId: z.string().min(1) }).strict();
const readSchema = z
  .object({
    terminalId: z.string().min(1),
    tailBytes: z.number().int().min(100).max(20_000).optional()
  })
  .strict();
const waitSchema = z
  .object({
    terminalId: z.string().min(1),
    pattern: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(100).max(120_000).optional()
  })
  .strict();
const requestAccessSchema = z.object({ terminalId: z.string().min(1) }).strict();
const writeSchema = z
  .object({
    terminalId: z.string().min(1),
    data: z.string().max(10_000).optional(),
    submit: z.boolean().optional(),
    key: z
      .enum(['enter', 'ctrl-c', 'tab', 'escape', 'up', 'down', 'left', 'right', 'backspace'])
      .optional()
  })
  .strict()
  .refine((value) => Boolean(value.data) || Boolean(value.key), {
    message: '至少需要 data 或 key'
  });

const pendingInput = new Map<string, string>();

const keys: Record<string, string> = {
  enter: '\r',
  'ctrl-c': '\u0003',
  tab: '\t',
  escape: '\u001b',
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  backspace: '\u007f'
};

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  requiresApproval: boolean
): AgentToolDefinition => ({
  name,
  description,
  permission: requiresApproval ? 'write' : 'read',
  requiresApproval,
  inputSchema: { type: 'object', properties, required, additionalProperties: false }
});

export const terminalToolDefinitions: AgentToolDefinition[] = [
  tool('terminal_get_settings', '读取终端 shell、字号、滚回与交互设置。', {}, [], false),
  tool(
    'terminal_update_settings',
    '更新终端设置；只传需要修改的字段，shell 可设为 null 使用自动检测。',
    {
      shell: { type: ['string', 'null'] },
      fontSize: { type: 'number', minimum: 9, maximum: 32 },
      scrollback: { type: 'number', minimum: 1000, maximum: 100000 },
      copyOnSelect: { type: 'boolean' },
      webgl: { type: 'boolean' }
    },
    [],
    true
  ),
  tool('terminal_list', '列出当前会话的终端。', {}, [], false),
  tool(
    'terminal_create',
    '新建一个交互式终端；默认使用当前工作区目录，cwd 必须在已授权工作区内。',
    {
      cwd: { type: 'string' },
      cols: { type: 'number' },
      rows: { type: 'number' }
    },
    [],
    true
  ),
  tool(
    'terminal_request_access',
    '请求用户授权 AI 读取和写入当前会话的用户终端；会触发对话审批。',
    { terminalId: { type: 'string' } },
    ['terminalId'],
    true
  ),
  tool(
    'terminal_read',
    '读取指定终端的尾部输出与运行状态。',
    {
      terminalId: { type: 'string' },
      tailBytes: { type: 'number' }
    },
    ['terminalId'],
    false
  ),
  tool(
    'terminal_wait',
    '等待指定终端出现匹配输出或退出；不传 pattern 时等待终端结束。',
    {
      terminalId: { type: 'string' },
      pattern: { type: 'string' },
      timeoutMs: { type: 'number' }
    },
    ['terminalId'],
    false
  ),
  tool(
    'terminal_write',
    '向指定终端写入文本或按键；可操作当前会话的用户终端或 AI 终端，需要审批。',
    {
      terminalId: { type: 'string' },
      data: { type: 'string' },
      submit: { type: 'boolean' },
      key: {
        type: 'string',
        enum: ['enter', 'ctrl-c', 'tab', 'escape', 'up', 'down', 'left', 'right', 'backspace']
      }
    },
    ['terminalId'],
    true
  ),
  tool(
    'terminal_close',
    '关闭指定终端并终止其进程组。',
    { terminalId: { type: 'string' } },
    ['terminalId'],
    true
  )
];

const success = (value: unknown): ToolExecutionResult => ({
  ok: true,
  output: JSON.stringify(value)
});

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

const resolveDefaultCwd = async (
  rootPaths: readonly string[] = []
): Promise<string | undefined> => {
  for (const root of rootPaths) {
    try {
      if ((await stat(root)).isDirectory()) return root;
    } catch {
      // 跳过失效或文件类型的 root，继续寻找目录 root
    }
  }
  return undefined;
};

const isInside = (root: string, target: string): boolean =>
  target === root || target.startsWith(`${root}${sep}`);

const resolveAuthorizedCwd = async (
  cwd: string,
  rootPaths: readonly string[] = []
): Promise<{ cwd: string } | { error: string }> => {
  try {
    const resolved = await realpath(cwd);
    if (!(await stat(resolved)).isDirectory()) return { error: '终端目录不存在或不是目录' };
    const roots = (
      await Promise.all(
        rootPaths.map(async (root) => {
          try {
            const real = await realpath(root);
            return (await stat(real)).isDirectory() ? real : undefined;
          } catch {
            return undefined;
          }
        })
      )
    ).filter((root): root is string => Boolean(root));
    if (!roots.some((root) => isInside(root, resolved))) {
      return { error: '终端目录不在已授权工作区内' };
    }
    return { cwd: resolved };
  } catch {
    return { error: '终端目录不存在或不是目录' };
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const listForSession = (options: TerminalToolOptions): TerminalSessionPublic[] =>
  terminalService
    .list(options.ownerId)
    .filter((terminal) => terminal.sessionId === options.sessionId);

const isTerminalVisible = (
  options: TerminalToolOptions,
  terminal: TerminalSessionPublic
): boolean =>
  terminal.sessionId === options.sessionId &&
  (options.ownerId === undefined || terminalService.isOwnedBy(terminal.id, options.ownerId));

const isAiAccessGranted = (terminal: TerminalSessionPublic): boolean =>
  terminal.source === 'ai' || terminal.aiAccess === true;

const accessDenied = (): ToolExecutionResult =>
  failure(
    'TERMINAL_ACCESS_DENIED',
    'AI 尚未获得操作该终端的权限。请让 AI 申请终端授权，或在终端标签右键选择「允许 AI 操作」后重试。'
  );

/**
 * 执行终端工具；终端操作始终绑定当前会话与发起窗口。
 */
export const executeTerminalTool = async (
  name: string,
  input: unknown,
  options: TerminalToolOptions
): Promise<ToolExecutionResult> => {
  if (name === 'terminal_get_settings') {
    if (!getSettingsSchema.safeParse(input).success) {
      return failure('TERMINAL_INVALID_INPUT', '参数不合法');
    }
    return success(await loadTerminalSettings(options.settingsDir));
  }

  if (name === 'terminal_list') {
    if (!listSchema.safeParse(input).success) {
      return failure('TERMINAL_INVALID_INPUT', '参数不合法');
    }
    return success({ terminals: listForSession(options) });
  }

  if (name === 'terminal_update_settings') {
    const parsed = updateSettingsSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端设置参数不合法');
    const current = await loadTerminalSettings(options.settingsDir);
    const next: TerminalSettings = {
      shell: parsed.data.shell !== undefined ? parsed.data.shell : current.shell,
      fontSize: parsed.data.fontSize ?? current.fontSize,
      scrollback: parsed.data.scrollback ?? current.scrollback,
      copyOnSelect: parsed.data.copyOnSelect ?? current.copyOnSelect,
      webgl: parsed.data.webgl ?? current.webgl
    };
    if (next.shell) {
      try {
        if (!(await stat(next.shell)).isFile()) {
          return failure('TERMINAL_SETTINGS_INVALID', 'Shell 路径不存在');
        }
      } catch {
        return failure('TERMINAL_SETTINGS_INVALID', 'Shell 路径不存在');
      }
    }
    try {
      return success(await applyTerminalSettings(next, options.settingsDir));
    } catch (error) {
      return failure(
        'TERMINAL_SETTINGS_FAILED',
        error instanceof Error ? error.message : '保存终端设置失败'
      );
    }
  }

  if (name === 'terminal_request_access') {
    const parsed = requestAccessSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端访问申请参数不合法');
    const snapshot = terminalService.readOutput(parsed.data.terminalId, 1);
    if (!snapshot || !isTerminalVisible(options, snapshot.terminal)) {
      return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
    }
    if (snapshot.terminal.source === 'ai' || snapshot.terminal.aiAccess === true) {
      return success({
        terminalId: parsed.data.terminalId,
        allowed: true,
        alreadyGranted: true
      });
    }
    const granted = terminalService.setAiAccess(parsed.data.terminalId, true);
    return granted
      ? success({ terminalId: parsed.data.terminalId, allowed: true, alreadyGranted: false })
      : failure('TERMINAL_ACCESS_UPDATE_FAILED', '更新终端授权失败');
  }

  if (name === 'terminal_read') {
    const parsed = readSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端读取参数不合法');
    const snapshot = terminalService.readOutput(
      parsed.data.terminalId,
      parsed.data.tailBytes ?? 4_000
    );
    if (!snapshot || !isTerminalVisible(options, snapshot.terminal)) {
      return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
    }
    if (!isAiAccessGranted(snapshot.terminal)) return accessDenied();
    if (snapshot.terminal.status !== 'running') pendingInput.delete(parsed.data.terminalId);
    return success({
      terminal: snapshot.terminal,
      output: snapshot.output,
      truncated: snapshot.truncated
    });
  }

  if (name === 'terminal_wait') {
    const parsed = waitSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端等待参数不合法');
    const timeoutMs = parsed.data.timeoutMs ?? 15_000;
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (options.signal?.aborted) {
        return failure('TERMINAL_WAIT_CANCELLED', '终端等待已取消');
      }
      const snapshot = terminalService.readOutput(parsed.data.terminalId, 200_000);
      if (!snapshot) return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
      if (!isTerminalVisible(options, snapshot.terminal)) {
        return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
      }
      if (!isAiAccessGranted(snapshot.terminal)) return accessDenied();
      if (snapshot.terminal.status !== 'running') pendingInput.delete(parsed.data.terminalId);
      const matched = parsed.data.pattern
        ? snapshot.output.includes(parsed.data.pattern)
        : snapshot.terminal.status !== 'running';
      if (matched) {
        return success({
          terminalId: snapshot.terminal.id,
          status: snapshot.terminal.status,
          matched: true,
          timedOut: false,
          truncated: snapshot.truncated || snapshot.output.length > 4_000,
          output: snapshot.output.slice(-4_000)
        });
      }
      if (snapshot.terminal.status !== 'running') {
        return success({
          terminalId: snapshot.terminal.id,
          status: snapshot.terminal.status,
          matched: false,
          timedOut: false,
          truncated: snapshot.truncated || snapshot.output.length > 4_000,
          output: snapshot.output.slice(-4_000)
        });
      }
      if (Date.now() >= deadline) {
        return success({
          terminalId: snapshot.terminal.id,
          status: snapshot.terminal.status,
          matched: false,
          timedOut: true,
          truncated: snapshot.truncated || snapshot.output.length > 4_000,
          output: snapshot.output.slice(-4_000)
        });
      }
      await sleep(200);
    }
  }

  if (name === 'terminal_create') {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端参数不合法');
    const defaultCwd = await resolveDefaultCwd(options.rootPaths);
    if (!parsed.data.cwd && !defaultCwd) {
      return failure('TERMINAL_WORKSPACE_REQUIRED', '请先选择工作区后再创建 AI 终端');
    }
    const cwdResult = await resolveAuthorizedCwd(parsed.data.cwd ?? defaultCwd!, options.rootPaths);
    if ('error' in cwdResult) {
      return failure('TERMINAL_INVALID_CWD', cwdResult.error);
    }
    const cwd = cwdResult.cwd;
    try {
      const settings = await loadTerminalSettings(options.settingsDir);
      const terminal = terminalService.create({
        sessionId: options.sessionId,
        cwd,
        shell: settings.shell,
        source: 'ai',
        ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
        ...(parsed.data.cols === undefined ? {} : { cols: parsed.data.cols }),
        ...(parsed.data.rows === undefined ? {} : { rows: parsed.data.rows })
      });
      return success(terminal);
    } catch (error) {
      return failure(
        'TERMINAL_CREATE_FAILED',
        error instanceof Error ? error.message : '创建终端失败'
      );
    }
  }

  if (name === 'terminal_write') {
    const parsed = writeSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端写入参数不合法');
    const snapshot = terminalService.readOutput(parsed.data.terminalId, 1);
    if (!snapshot || !isTerminalVisible(options, snapshot.terminal)) {
      return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
    }
    if (!isAiAccessGranted(snapshot.terminal)) return accessDenied();
    if (snapshot.terminal.status !== 'running') {
      pendingInput.delete(parsed.data.terminalId);
      return failure('TERMINAL_NOT_RUNNING', '终端已退出，无法写入');
    }
    const data = parsed.data.data ?? '';
    const pending = pendingInput.get(parsed.data.terminalId) ?? '';
    const candidate = `${pending}${data}`;
    const danger = detectDangerousCommand(candidate);
    if (danger) {
      pendingInput.delete(parsed.data.terminalId);
      return failure('COMMAND_BLOCKED', danger);
    }
    const submits =
      parsed.data.submit === true || parsed.data.key === 'enter' || /[\r\n]/.test(data);
    if (submits || parsed.data.key === 'ctrl-c' || parsed.data.key === 'escape') {
      pendingInput.delete(parsed.data.terminalId);
    } else if (candidate) {
      pendingInput.set(parsed.data.terminalId, candidate.slice(-10_000));
    }
    let payload = data;
    if (parsed.data.submit && !/[\r\n]$/.test(payload)) payload += '\r';
    if (parsed.data.key) payload += keys[parsed.data.key] ?? '';
    if (!terminalService.write(parsed.data.terminalId, payload)) {
      return failure('TERMINAL_WRITE_FAILED', '终端写入失败');
    }
    return success({
      terminalId: parsed.data.terminalId,
      bytes: Buffer.byteLength(payload, 'utf8')
    });
  }

  if (name === 'terminal_close') {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return failure('TERMINAL_INVALID_INPUT', '终端 ID 不合法');
    if (!listForSession(options).some((terminal) => terminal.id === parsed.data.terminalId)) {
      return failure('TERMINAL_NOT_FOUND', '终端不存在或不属于当前会话');
    }
    const closed = terminalService.close(parsed.data.terminalId);
    if (closed) pendingInput.delete(parsed.data.terminalId);
    return closed
      ? success({ terminalId: parsed.data.terminalId, closed })
      : failure('TERMINAL_CLOSE_FAILED', '关闭终端失败');
  }

  return failure('TERMINAL_UNKNOWN_ACTION', `未知终端操作：${name}`);
};
