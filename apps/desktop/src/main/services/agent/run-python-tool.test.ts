/**
 * run_python 工具：参数/依赖名校验、子代理提示、以及脚本执行（成功/超时/截断/取消）。
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nexus-run-python-test' } }));
vi.mock('node:child_process', () => ({ spawn: state.spawn }));
vi.mock('../python/python-runtime', () => ({
  detectPython: vi.fn(async () => undefined),
  ensureInstalledPython: vi.fn(),
  installPackages: vi.fn(),
  missingPackages: vi.fn(async () => [])
}));

import * as pythonRuntime from '../python/python-runtime';
import { executeRunPythonTool, isValidPackageSpec } from './run-python-tool';

interface FakeChild extends EventEmitter {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

const makeChild = (): FakeChild => {
  const child = new EventEmitter() as FakeChild;
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
};

const options = {
  resolveCwd: async (): Promise<string> => '/tmp',
  confirm: async (): Promise<boolean> => true
};

const systemRuntime = { file: 'python3', baseArgs: [], source: 'system' as const };

describe('isValidPackageSpec', () => {
  it('accepts plain names, extras and version specifiers', () => {
    expect(isValidPackageSpec('requests')).toBe(true);
    expect(isValidPackageSpec('uvicorn[standard]')).toBe(true);
    expect(isValidPackageSpec('Pillow>=9.0')).toBe(true);
  });

  it('rejects values that could inject pip options', () => {
    expect(isValidPackageSpec('--index-url')).toBe(false);
    expect(isValidPackageSpec('-r')).toBe(false);
    expect(isValidPackageSpec('a b')).toBe(false);
    expect(isValidPackageSpec('pkg;rm -rf /')).toBe(false);
    expect(isValidPackageSpec('')).toBe(false);
  });
});

describe('executeRunPythonTool validation', () => {
  it('rejects invalid input before doing anything', async () => {
    const result = await executeRunPythonTool({}, options);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PYTHON_INVALID_INPUT');
  });

  it('rejects package specs that look like pip flags', async () => {
    const result = await executeRunPythonTool(
      { code: 'print(1)', packages: ['--index-url'] },
      options
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PYTHON_INVALID_PACKAGE');
  });

  it('asks the main agent to install when a subagent needs the runtime', async () => {
    vi.mocked(pythonRuntime.detectPython).mockResolvedValueOnce(undefined);
    const result = await executeRunPythonTool(
      { code: 'print(1)' },
      { ...options, allowInstall: false }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PYTHON_INSTALL_REQUIRED');
  });

  it('asks the main agent to install packages in a subagent when dependencies are missing', async () => {
    vi.mocked(pythonRuntime.detectPython).mockResolvedValueOnce(systemRuntime);
    vi.mocked(pythonRuntime.missingPackages).mockResolvedValueOnce(['requests']);
    const result = await executeRunPythonTool(
      { code: 'print(1)', packages: ['requests'] },
      { ...options, allowInstall: false }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PYTHON_PACKAGES_REQUIRED');
  });
});

describe('executeRunPythonTool execution', () => {
  beforeEach(() => {
    state.spawn.mockReset();
    vi.mocked(pythonRuntime.detectPython).mockReset();
    vi.mocked(pythonRuntime.detectPython).mockResolvedValue(systemRuntime);
  });

  /** 等待脚本子进程被 spawn 后再触发事件，确保监听器已挂载。 */
  const waitForSpawn = async (): Promise<void> => {
    await vi.waitFor(() => expect(state.spawn).toHaveBeenCalled());
    await new Promise((resolve) => setImmediate(resolve));
  };

  it('returns captured output on success', async () => {
    const child = makeChild();
    state.spawn.mockReturnValueOnce(child);
    const promise = executeRunPythonTool({ code: 'print(1)' }, options);

    await waitForSpawn();
    child.stdout.emit('data', Buffer.from('hello'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ ok: true, output: 'hello' });
  });

  it('reports a timeout when the script does not finish', async () => {
    const child = makeChild();
    state.spawn.mockReturnValueOnce(child);
    const promise = executeRunPythonTool({ code: 'sleep', timeoutMs: 20 }, options);

    await waitForSpawn();
    await new Promise((resolve) => setTimeout(resolve, 40));
    child.emit('close', null);

    const result = await promise;
    expect(result.error?.code).toBe('PYTHON_TIMEOUT');
  });

  it('reports truncation when output exceeds the limit', async () => {
    const child = makeChild();
    state.spawn.mockReturnValueOnce(child);
    const promise = executeRunPythonTool({ code: 'print' }, options);

    await waitForSpawn();
    child.stdout.emit('data', Buffer.alloc(200_001, 65));
    child.emit('close', 0);

    const result = await promise;
    expect(result.error?.code).toBe('PYTHON_OUTPUT_TRUNCATED');
  });

  it('reports cancellation when the run is aborted', async () => {
    const child = makeChild();
    state.spawn.mockReturnValueOnce(child);
    const controller = new AbortController();
    const promise = executeRunPythonTool({ code: 'print' }, {
      ...options,
      signal: controller.signal
    });

    await waitForSpawn();
    controller.abort();
    child.emit('close', 1);

    const result = await promise;
    expect(result.error?.code).toBe('PYTHON_CANCELLED');
  });
});
