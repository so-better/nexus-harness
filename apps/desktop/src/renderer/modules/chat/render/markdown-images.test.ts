// @vitest-environment jsdom
/**
 * Markdown 图片加载态：复用媒体骨架，保留原属性，加载完成或失败后切换状态。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { enhanceMarkdownImages } from './markdown-images';

const image = (src = 'https://images.pexels.com/photo.jpeg'): HTMLImageElement => {
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'cover';
  img.title = 'cover title';
  img.width = 640;
  img.height = 360;
  return img;
};

describe('enhanceMarkdownImages', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps images with the shared loading skeleton and keeps attributes', () => {
    const root = document.createElement('div');
    const img = image();
    Object.defineProperty(img, 'complete', { configurable: true, value: false });
    root.appendChild(img);
    document.body.appendChild(root);

    enhanceMarkdownImages(root);

    const wrapper = root.querySelector<HTMLElement>('.nh-md-image');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('is-loading')).toBe(true);
    expect(wrapper?.querySelector('.nh-preview-loading__surface--image')).not.toBeNull();
    expect(wrapper?.querySelector('.nh-preview-loading__status')).toBeNull();
    expect(wrapper?.querySelector('.nh-preview-loading')?.getAttribute('aria-label')).not.toBe('');
    expect(wrapper?.getAttribute('aria-busy')).toBe('true');
    expect(img.getAttribute('title')).toBe('cover title');
    expect(img.getAttribute('width')).toBe('640');
    expect(img.getAttribute('height')).toBe('360');
  });

  it('reveals the image on load and shows a retryable error otherwise', () => {
    const root = document.createElement('div');
    const loading = image();
    const failing = image('https://images.pexels.com/missing.jpeg');
    Object.defineProperty(loading, 'complete', { configurable: true, value: false });
    Object.defineProperty(failing, 'complete', { configurable: true, value: false });
    root.append(loading, failing);
    document.body.appendChild(root);

    enhanceMarkdownImages(root);
    loading.dispatchEvent(new Event('load'));
    failing.dispatchEvent(new Event('error'));

    const wrappers = [...root.querySelectorAll<HTMLElement>('.nh-md-image')];
    expect(wrappers[0]?.classList.contains('is-loaded')).toBe(true);
    expect(wrappers[0]?.getAttribute('aria-busy')).toBe('false');
    expect(wrappers[1]?.classList.contains('is-error')).toBe(true);
    const retry = wrappers[1]?.querySelector<HTMLButtonElement>('.nh-md-image__retry');
    expect(retry).not.toBeNull();
    retry?.click();
    expect(wrappers[1]?.classList.contains('is-loading')).toBe(true);
    const retried = wrappers[1]?.querySelector<HTMLImageElement>('.nh-md-image__img');
    expect(retried?.getAttribute('src')).toContain('nh_retry');
  });
});

describe('Markdown image retry cache policy', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const failingImage = (src: string): { root: HTMLElement; image: HTMLImageElement } => {
    const root = document.createElement('div');
    const image = document.createElement('img');
    image.src = src;
    image.alt = 'failed';
    Object.defineProperty(image, 'complete', { configurable: true, value: false });
    root.appendChild(image);
    document.body.appendChild(root);
    enhanceMarkdownImages(root);
    image.dispatchEvent(new Event('error'));
    root.querySelector<HTMLButtonElement>('.nh-md-image__retry')?.click();
    return { root, image };
  };

  it('adds a cache-buster for unsigned query URLs', () => {
    const { root } = failingImage('https://images.pexels.com/photo.jpeg?size=large');
    const image = root.querySelector<HTMLImageElement>('.nh-md-image__img');
    expect(image?.getAttribute('src')).toContain('nh_retry');
  });

  it('does not rewrite signed URLs', () => {
    const { root } = failingImage(
      'https://images.example.com/photo.jpeg?X-Amz-Signature=abc123&Expires=123'
    );
    const image = root.querySelector<HTMLImageElement>('.nh-md-image__img');
    expect(image?.getAttribute('src')).not.toContain('nh_retry');
  });
});
