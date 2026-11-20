// @vitest-environment jsdom
/**
 * 加载骨架：媒体加载只保留视觉骨架，文本加载保留状态文字。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import FilePreviewLoading from './FilePreviewLoading.vue';

const mount = (kind: 'image' | 'video' | 'text') => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(FilePreviewLoading, { kind });
  app.mount(host);
  return { host, app };
};

describe('FilePreviewLoading', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('hides loading text for media but keeps an accessible label', () => {
    const { host, app } = mount('image');
    const root = host.querySelector<HTMLElement>('.nh-preview-loading');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-label')).not.toBe('');
    expect(host.querySelector('.nh-preview-loading__status')).toBeNull();
    app.unmount();
  });

  it('keeps the loading text for text previews', () => {
    const { host, app } = mount('text');
    expect(host.querySelector('.nh-preview-loading__status')).not.toBeNull();
    app.unmount();
  });
});
