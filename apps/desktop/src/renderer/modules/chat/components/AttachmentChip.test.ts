// @vitest-environment jsdom
/**
 * 附件 chip：图片附件展示缩略图，非图片保留回形针图标。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { MessageAttachment } from '@shared/events';

vi.mock('../api/attachments.api', () => ({
  readAttachmentImage: vi.fn()
}));

import { readAttachmentImage } from '../api/attachments.api';
import AttachmentChip from './AttachmentChip.vue';

const readMock = vi.mocked(readAttachmentImage);
const imageAttachment: MessageAttachment = {
  id: 'attachment-image',
  sessionId: 'session-1',
  name: 'pasted.png',
  mime: 'image/png',
  bytes: 1024,
  createdAt: 0
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('AttachmentChip', () => {
  afterEach(() => {
    readMock.mockReset();
    document.body.innerHTML = '';
  });

  it('loads an image thumbnail from the attachment service', async () => {
    readMock.mockResolvedValue({ mime: 'image/png', base64: 'aW1hZ2U=' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(AttachmentChip, { attachment: imageAttachment });
    app.mount(host);
    await flush();

    expect(readMock).toHaveBeenCalledWith('session-1', 'attachment-image');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,aW1hZ2U=');
    app.unmount();
  });

  it('uses the paperclip fallback for non-image attachments', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(AttachmentChip, {
      attachment: { ...imageAttachment, mime: 'text/plain', name: 'notes.txt' }
    });
    app.mount(host);
    await flush();

    expect(readMock).not.toHaveBeenCalled();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('notes.txt');
    app.unmount();
  });
});
