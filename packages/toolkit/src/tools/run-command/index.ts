/**
 * run_command：在授权目录执行命令，限制超时与输出。
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import {
  buildShellInvocation,
  createShellEnvironment,
  detectDangerousCommand
} from '@nexus/runtime-utils';
import type { FileToolContext, FileToolDefinition, FileToolResult } from '../../internal';
import { FileToolError, resolveWithinRoots, validateInput } from '../../internal';

export const runCommandInputSchema = z.object({
  command: z.string().min(1).max(10_000),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional()
});

export const runCommandToolDefinition: FileToolDefinition = {
  name: 'run_command',
  description: '在授权目录内执行命令；需要用户审批，超时会终止进程树。',
  permission: 'execute',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string' },
      timeoutMs: { type: 'number' }
    },
    required: ['command']
  }
};

export const runRunCommandTool = async (
  { roots, primaryRoot }: FileToolContext,
  input: unknown
): Promise<FileToolResult> => {
  const parsed = validateInput(runCommandInputSchema, input);
  const danger = detectDangerousCommand(parsed.command);
  if (danger) throw new FileToolError('COMMAND_BLOCKED', danger);

  const cwd = await resolveWithinRoots(roots, primaryRoot, parsed.cwd ?? '.');
  const cwdInfo = await stat(cwd);
  if (!cwdInfo.isDirectory()) throw new FileToolError('INVALID_CWD', 'cwd 必须是目录');

  const timeoutMs = parsed.timeoutMs ?? 30_000;
  const maxOutputBytes = 200_000;
  const invocation = buildShellInvocation(parsed.command);
  const env = createShellEnvironment();

  return new Promise<FileToolResult>((resolve) => {
    const child = spawn(invocation.file, invocation.args, {
      cwd,
      env,
      detached: process.platform !== 'win32'
    });
    let output = '';
    let truncated = false;
    let timedOut = false;
    let finished = false;

    const finish = (code: number | null, error?: string): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, output, error: { code: 'COMMAND_TIMEOUT', message: '命令执行超时' } });
        return;
      }
      if (truncated) {
        resolve({
          ok: false,
          output,
          error: { code: 'COMMAND_OUTPUT_TRUNCATED', message: '输出超限被截断' }
        });
        return;
      }
      if (error) {
        resolve({ ok: false, output, error: { code: 'COMMAND_FAILED', message: error } });
        return;
      }
      if (code === 0) resolve({ ok: true, output });
      else
        resolve({
          ok: false,
          output,
          error: { code: 'COMMAND_EXIT_NONZERO', message: `退出码 ${code ?? 'unknown'}` }
        });
    };

    const killTree = (): void => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        } else {
          process.kill(-child.pid, 'SIGTERM');
        }
      } catch {
        child.kill('SIGTERM');
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const append = (chunk: Buffer): void => {
      if (truncated) return;
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output, 'utf8') > maxOutputBytes) {
        output = output.slice(0, maxOutputBytes);
        truncated = true;
        killTree();
      }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (code) => finish(code));
  });
};
