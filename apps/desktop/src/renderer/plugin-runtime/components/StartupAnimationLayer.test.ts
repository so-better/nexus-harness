// @vitest-environment jsdom
/**
 * 启动动画宿主层：挂载一次、完成后清理，并允许点击跳过。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

const runtimeState = vi.hoisted(() => ({
  version: 0,
  activeStartupMount: null as null | {
    pluginId: string;
    id: string;
    title: string;
    pluginName: string;
    durationMs?: number;
    context: Record<string, never>;
    mount: (element: HTMLElement, ctx: unknown, finish: () => void) => () => void;
  },
  init: vi.fn(async () => undefined),
  activateForStartup: vi.fn(async () => undefined),
  reportPluginFailure: vi.fn()
}));

vi.mock('../runtime.store', () => ({
  usePluginRuntimeStore: () => runtimeState
}));

import StartupAnimationLayer from './StartupAnimationLayer.vue';

const flush = async (): Promise<void> => {
  await nextTick();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe('StartupAnimationLayer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    runtimeState.activeStartupMount = null;
    runtimeState.init.mockClear();
    runtimeState.activateForStartup.mockClear();
  });

  it('does not show an overlay when no animation is selected', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(StartupAnimationLayer);
    app.mount(host);
    await flush();

    expect(runtimeState.activateForStartup).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLElement>('.nh-startup')?.style.display).toBe('none');
    app.unmount();
  });

  it('mounts the contributed animation and hides after finish', async () => {
    const dispose = vi.fn();
    let finish: (() => void) | undefined;
    runtimeState.activeStartupMount = {
      pluginId: 'nexus.test-startup',
      id: 'intro',
      title: 'Intro',
      pluginName: 'Startup',
      context: {},
      mount: (_element, _ctx, done) => {
        finish = done;
        return dispose;
      }
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(StartupAnimationLayer);
    app.mount(host);
    await flush();

    expect(runtimeState.activateForStartup).toHaveBeenCalledTimes(1);
    expect(finish).toBeTypeOf('function');
    expect(document.querySelector<HTMLElement>('.nh-startup')?.style.display).not.toBe('none');

    finish?.();
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector<HTMLElement>('.nh-startup')?.style.display).toBe('none');
    app.unmount();
  });

  it('skips when the overlay is clicked', async () => {
    const dispose = vi.fn();
    runtimeState.activeStartupMount = {
      pluginId: 'nexus.test-startup',
      id: 'intro',
      title: 'Intro',
      pluginName: 'Startup',
      context: {},
      mount: () => dispose
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(StartupAnimationLayer);
    app.mount(host);
    await flush();

    document.querySelector<HTMLElement>('.nh-startup')?.click();
    await flush();
    expect(dispose).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
