// @vitest-environment jsdom
/**
 * 外部链接点击：http/https/mailto 外开，相对链接与媒体 blob 不导航。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAnchorClick } from './link-handler';

const click = (href: string, attrs?: { download?: boolean }) => {
  const open = vi.fn();
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  if (attrs?.download) anchor.setAttribute('download', '');
  document.body.appendChild(anchor);
  anchor.addEventListener('click', (event) => handleAnchorClick(event, open));
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  anchor.dispatchEvent(event);
  anchor.remove();
  return { event, open };
};

describe('handleAnchorClick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens http links externally', () => {
    const { event, open } = click('https://example.com/image.png');
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/image.png');
  });

  it('opens mailto links externally', () => {
    const { event, open } = click('mailto:hello@example.com');
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith('mailto:hello@example.com');
  });

  it('blocks relative links without opening them', () => {
    const { event, open } = click('./local.md');
    expect(event.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('allows hash links', () => {
    const { event, open } = click('#section');
    expect(event.defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves blob and download links to their own handlers', () => {
    const blob = click('blob:https://nexus.test/image');
    expect(blob.event.defaultPrevented).toBe(false);
    expect(blob.open).not.toHaveBeenCalled();

    const download = click('https://example.com/file.zip', { download: true });
    expect(download.event.defaultPrevented).toBe(false);
    expect(download.open).not.toHaveBeenCalled();
  });
});
