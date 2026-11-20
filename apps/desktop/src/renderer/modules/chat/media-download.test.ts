// @vitest-environment jsdom
/**
 * 媒体下载拦截：确保图片预览里的 blob 链接不会导航离开应用。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMediaDownload } from './media-download';

describe('registerMediaDownload', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prevents blob navigation and calls the registered save handler', async () => {
    const handler = vi.fn(async () => undefined);
    const unregister = registerMediaDownload('blob:https://nexus.test/image', handler);
    const anchor = document.createElement('a');
    anchor.href = 'blob:https://nexus.test/image';
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('forces a download when no handler is registered', () => {
    const anchor = document.createElement('a');
    anchor.href = 'blob:https://nexus.test/unregistered';
    document.body.appendChild(anchor);
    const clickSpy = vi.spyOn(anchor, 'click');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(anchor.getAttribute('download')).toBe('download');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
