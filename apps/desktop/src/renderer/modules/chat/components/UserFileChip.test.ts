// @vitest-environment jsdom
/**
 * @ 引用 chip：图片引用展示工作区缩略图，普通文件保留 @ 标记。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';

vi.mock('../api/workspace.api', () => ({
  readWorkspaceImage: vi.fn()
}));

import { readWorkspaceImage } from '../api/workspace.api';
import UserFileChip from './UserFileChip.vue';

const readMock = vi.mocked(readWorkspaceImage);
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('UserFileChip', () => {
  afterEach(() => {
    readMock.mockReset();
    document.body.innerHTML = '';
  });

  it('loads a workspace image thumbnail for @ references', async () => {
    readMock.mockResolvedValue({ mime: 'image/png', base64: 'aW1hZ2U=' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(UserFileChip, {
      file: { path: '/workspace/photo.png', name: 'photo.png' },
      sessionId: 'session-1'
    });
    app.mount(host);
    await flush();

    expect(readMock).toHaveBeenCalledWith('session-1', '/workspace/photo.png');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=');
    expect(host.textContent).toContain('@');
    app.unmount();
  });

  it('does not read a non-image reference', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(UserFileChip, {
      file: { path: '/workspace/notes.txt', name: 'notes.txt', bytes: 2048 },
      sessionId: 'session-1',
      removable: true
    });
    app.mount(host);
    await flush();

    expect(readMock).not.toHaveBeenCalled();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('notes.txt');
    expect(host.textContent).toContain('2 KB');
    expect(host.querySelector('.nh-file-chip__remove svg')).not.toBeNull();
    app.unmount();
  });
});
