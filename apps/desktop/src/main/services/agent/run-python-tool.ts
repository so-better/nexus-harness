/**
 * run_python 工具：在授权目录内运行 Python 脚本。
 * 缺少运行时时先经用户确认再安装到 userData；依赖包通过 pip 安装同样需要确认。
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentToolDefinition, ToolExecutionResult } from '@nexus/core';
import { createShellEnvironment } from '@nexus/runtime-utils';
import { getAppDataPaths } from '../storage/paths';
import {
  detectPython,
  ensureInstalledPython,
  installPackages,
  missingPackages,
  type PythonRuntime
} from '../python/python-runtime';

const MAX_OUTPUT_BYTES = 200_000;

/**
 * 校验 pip 依赖规格：以字母数字开头，可带 extras 与版本约束，禁止以 `-` 开头以防注入 pip 选项。
 * 版本段限定安全字符集，避免分号/引号等进入参数。
 */
export const isValidPackageSpec = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9._,-]+\])?([<>=!~][A-Za-z0-9._*+=<>!~,\s-]*)?$/.test(
    value
  );

const inputSchema = z
  .object({
    code: z.string().min(1).max(200_000),
    cwd: z.string().optional(),
    packages: z.array(z.string().min(1).max(200)).max(50).optional(),
    timeoutMs: z.number().int().positive().max(120_000).optional()
  })
  .strict();

export const runPythonToolDefinition: AgentToolDefinition = {
  name: 'run_python',
  description:
    '在授权工作目录内运行一段 Python 脚本，适合数据处理、批量文件操作等一步到位的任务。缺少 Python 运行时会请求安装到本机用户目录；packages 中列出的依赖会通过 pip 联网安装。需要审批。',
  permission: 'execute',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python 源码' },
      cwd: { type: 'string', description: '相对工作目录根的执行目录，默认根目录' },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: '需要 pip 安装的第三方依赖包名'
      },
      timeoutMs: { type: 'number', description: '超时毫秒，默认 30000，上限 120000' }
    },
    required: ['code'],
    additionalProperties: false
  }
};

/** 工具进度阶段：安装阶段来自运行时服务，packages 为依赖安装。 */
export interface RunPythonProgress {
  phase: 'fetch' | 'download' | 'verify' | 'extract' | 'packages' | 'done';
  ratio?: number;
  detail?: string;
}

export interface RunPythonOptions {
  /** 把相对目录解析为授权范围内的绝对路径 */
  resolveCwd: (target: string) => Promise<string>;
  /** 安装运行时 / 安装依赖前的用户确认；返回 false 表示拒绝 */
  confirm: (request: { title: string; description: string }) => Promise<boolean>;
  /** 安装进度回调，用于向前端推送 tool.progress */
  onProgress?: (progress: RunPythonProgress) => void;
  /** 是否允许触发安装（子代理为 false，缺失时返回可操作提示由主 Agent 安装） */
  allowInstall?: boolean;
  signal?: AbortSignal;
}

const failure = (code: string, message: string): ToolExecutionResult => ({
  ok: false,
  output: '',
  error: { code, message }
});

/**
 * 写入临时脚本并在授权目录内执行，捕获输出、超时终止进程树。
 */
const runScript = async (
  runtime: PythonRuntime,
  code: string,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<ToolExecutionResult> => {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-pyrun-'));
  const script = join(directory, 'main.py');
  await writeFile(script, code, 'utf8');

  return new Promise<ToolExecutionResult>((resolve) => {
    const child = spawn(runtime.file, [...runtime.baseArgs, script], {
      cwd,
      env: { ...createShellEnvironment(), PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      detached: process.platform !== 'win32'
    });
    let output = '';
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let finished = false;

    const cleanup = (): void => {
      rm(directory, { recursive: true, force: true }).catch(() => undefined);
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

    const finish = (code_: number | null, error?: string): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      // 取消优先于其它原因，避免被误判为脚本执行失败
      if (aborted) {
        resolve(failure('PYTHON_CANCELLED', '执行已取消'));
        return;
      }
      if (timedOut) {
        resolve(failure('PYTHON_TIMEOUT', `执行超时（${timeoutMs}ms）`));
        return;
      }
      if (truncated) {
        resolve({
          ok: false,
          output,
          error: { code: 'PYTHON_OUTPUT_TRUNCATED', message: '输出超限被截断' }
        });
        return;
      }
      if (error) {
        resolve(failure('PYTHON_FAILED', error));
        return;
      }
      if (code_ === 0) resolve({ ok: true, output });
      else resolve(failure('PYTHON_EXIT_NONZERO', `退出码 ${code_ ?? 'unknown'}`));
    };

    const onAbort = (): void => {
      aborted = true;
      killTree();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const append = (chunk: Buffer): void => {
      if (truncated) return;
      output += chunk.toString('utf8');
      if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
        output = output.slice(0, MAX_OUTPUT_BYTES);
        truncated = true;
        killTree();
      }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (exitCode) => finish(exitCode));
  });
};

/**
 * 执行 run_python：确保运行时与依赖就绪后运行脚本。
 */
export const executeRunPythonTool = async (
  input: unknown,
  options: RunPythonOptions
): Promise<ToolExecutionResult> => {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure('PYTHON_INVALID_INPUT', 'run_python 参数不合法');

  const packages = parsed.data.packages ?? [];
  const invalid = packages.find((name) => !isValidPackageSpec(name));
  if (invalid) return failure('PYTHON_INVALID_PACKAGE', `依赖名不合法：${invalid}`);

  const root = getAppDataPaths().root;
  const signal = options.signal ? { signal: options.signal } : {};
  try {
    let runtime = await detectPython(root);
    if (!runtime) {
      // 子代理不触发安装：返回可操作提示，由主 Agent 安装一次后复用
      if (options.allowInstall === false) {
        return failure(
          'PYTHON_INSTALL_REQUIRED',
          '子代理不安装 Python 运行时。请由主 Agent 调用 run_python 触发一次安装（会请求用户确认），之后子代理即可复用。'
        );
      }
      const approved = await options.confirm({
        title: '安装 Python 运行时',
        description:
          '本机未检测到可用 Python。将下载并安装独立运行时到应用数据目录（python-build-standalone，约 40–70MB）。'
      });
      if (!approved) return failure('PYTHON_INSTALL_DENIED', '用户拒绝安装 Python 运行时');
      try {
        // 单飞安装：并发 Run 触发的安装共享同一次执行
        runtime = await ensureInstalledPython(root, {
          ...signal,
          onProgress: (progress) =>
            options.onProgress?.({
              phase: progress.phase,
              ...(progress.ratio === undefined ? {} : { ratio: progress.ratio })
            })
        });
      } catch (error) {
        return failure(
          'PYTHON_INSTALL_FAILED',
          error instanceof Error ? error.message : '安装 Python 运行时失败'
        );
      }
    }

    if (packages.length) {
      // 已安装的依赖跳过网络与审批
      const missing = await missingPackages(runtime, packages, signal);
      if (missing.length) {
        // 子代理不安装依赖：提示由主 Agent 安装
        if (options.allowInstall === false) {
          return failure(
            'PYTHON_PACKAGES_REQUIRED',
            `子代理不安装 Python 依赖（缺少：${missing.join('、')}）。请由主 Agent 调用 run_python 安装后再继续。`
          );
        }
        const approved = await options.confirm({
          title: '安装 Python 依赖',
          description: `将通过 pip 联网安装：${missing.join('、')}`
        });
        if (!approved) return failure('PYTHON_PACKAGES_DENIED', '用户拒绝安装依赖');
        try {
          options.onProgress?.({ phase: 'packages', detail: missing.join(', ') });
          await installPackages(runtime, missing, signal);
        } catch (error) {
          return failure(
            'PYTHON_PACKAGES_FAILED',
            error instanceof Error ? error.message : '安装 Python 依赖失败'
          );
        }
      }
    }

    const cwd = await options.resolveCwd(parsed.data.cwd ?? '.');
    return await runScript(
      runtime,
      parsed.data.code,
      cwd,
      parsed.data.timeoutMs ?? 30_000,
      options.signal
    );
  } catch (error) {
    return failure('PYTHON_RUN_FAILED', error instanceof Error ? error.message : 'Python 执行失败');
  }
};
