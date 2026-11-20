// @vitest-environment jsdom
/**
 * 内联媒体失败态：读取失败时只显示重试，不显示另存为。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { OutputFile } from '@shared/ipc/contracts';

vi.mock('../api/files.api', () => ({ readOutputFile: vi.fn() }));
vi.mock('../use-output-file-save', () => ({
  useOutputFileSave: () => ({ saveAs: vi.fn() })
}));

import { readOutputFile } from '../api/files.api';
import InlineMediaFile from './InlineMediaFile.vue';

const readMock = vi.mocked(readOutputFile);

class MockIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }

  disconnect(): void {}

  unobserve(): void {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const testFile: OutputFile = {
  id: 'file-broken',
  sessionId: 'session-1',
  name: 'broken.png',
  mime: 'image/png',
  bytes: 10,
  source: 'generated',
  createdAt: 0
};

describe('InlineMediaFile error state', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    readMock.mockReset();
    readMock.mockRejectedValue(new Error('文件不存在'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows only retry and retries the read', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(InlineMediaFile, { file: testFile });
    app.mount(host);
    await flush();

    const error = host.querySelector('.nh-inline-media__error');
    expect(error).not.toBeNull();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.n-button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).not.toContain('另存为');
    expect(readMock).toHaveBeenCalledTimes(1);

    buttons[0]?.click();
    await flush();
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.nh-inline-media__error')).not.toBeNull();

    app.unmount();
  });
});
