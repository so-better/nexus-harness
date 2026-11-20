/**
 * Markdown 图片加载态：复用媒体骨架的视觉，加载完成显示原图，失败可重试。
 */
import { t } from '@/app/i18n';

const IMAGE_ATTR = 'data-nh-image';
const WRAPPER_CLASS = 'nh-md-image';
const IMAGE_CLASS = 'nh-md-image__img';
const LOADING_CLASS = 'is-loading';
const LOADED_CLASS = 'is-loaded';
const ERROR_CLASS = 'is-error';

const icon = (path: string, size: number): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg>`;

const createLoading = (): HTMLElement => {
  const loading = document.createElement('span');
  loading.className = 'nh-preview-loading';
  loading.setAttribute('role', 'status');
  loading.setAttribute('aria-label', t('common.loading'));
  loading.innerHTML = `<span class="nh-preview-loading__surface nh-preview-loading__surface--image"><span class="nh-preview-loading__media">${icon('M4 5h16v14H4zM7 15l3-3 2 2 3-3 3 3M8 9h.01', 32)}</span><span class="nh-preview-loading__shimmer"></span><span class="nh-preview-loading__progress"></span></span>`;
  return loading;
};

const createError = (name: string, retry: () => void): HTMLElement => {
  const error = document.createElement('span');
  error.className = 'nh-md-image__error';
  error.innerHTML = `<span class="nh-md-image__alert">${icon('M12 3 2 21h20L12 3ZM12 9v5M12 17h.01', 20)}</span><span class="nh-md-image__error-copy"><span class="nh-md-image__error-name"></span><span class="nh-md-image__error-text"></span></span><button type="button" class="nh-md-image__retry">${icon('M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.2-2.6L20 9M4 15l2.7 2.6A7 7 0 0 0 17.9 15', 14)}<span></span></button>`;
  const errorName = error.querySelector('.nh-md-image__error-name');
  const errorText = error.querySelector('.nh-md-image__error-text');
  const retryText = error.querySelector('.nh-md-image__retry span');
  if (errorName) errorName.textContent = name;
  if (errorText) errorText.textContent = t('file.previewRenderFailed');
  if (retryText) retryText.textContent = t('app.retry');
  error.querySelector('.nh-md-image__retry')?.addEventListener('click', retry);
  return error;
};

const enhanceImage = (image: HTMLImageElement): void => {
  if (image.getAttribute(IMAGE_ATTR) === 'true') return;
  const wrapper = document.createElement('span');
  wrapper.className = `${WRAPPER_CLASS} ${LOADING_CLASS}`;
  const loading = createLoading();
  let currentImage = image;

  const setLoading = (): void => {
    wrapper.classList.remove(LOADED_CLASS, ERROR_CLASS);
    wrapper.classList.add(LOADING_CLASS);
    wrapper.setAttribute('aria-busy', 'true');
  };

  const setLoaded = (): void => {
    wrapper.classList.remove(LOADING_CLASS, ERROR_CLASS);
    wrapper.classList.add(LOADED_CLASS);
    wrapper.setAttribute('aria-busy', 'false');
  };

  const setError = (): void => {
    wrapper.classList.remove(LOADING_CLASS, LOADED_CLASS);
    wrapper.classList.add(ERROR_CLASS);
    wrapper.setAttribute('aria-busy', 'false');
  };

  const addListeners = (target: HTMLImageElement): void => {
    target.addEventListener('load', () => setLoaded(), { once: true });
    target.addEventListener('error', () => setError(), { once: true });
  };

  const retry = (): void => {
    setLoading();
    const original = currentImage.getAttribute('src') ?? '';
    if (!original) {
      setError();
      return;
    }
    let next = original;
    if (!/^(data|blob):/i.test(original)) {
      try {
        const url = new URL(original, window.location.href);
        const signed = [...url.searchParams.keys()].some((key) =>
          /^(x-amz-|signature$|sig$|token$|expires$|policy$|key$|auth$)/i.test(key)
        );
        if (!signed) url.searchParams.set('nh_retry', String(Date.now()));
        next = url.href;
      } catch {
        next = original;
      }
    }
    const nextImage = document.createElement('img');
    for (const attr of currentImage.attributes) {
      if (attr.name !== 'src') nextImage.setAttribute(attr.name, attr.value);
    }
    addListeners(nextImage);
    currentImage.replaceWith(nextImage);
    currentImage = nextImage;
    nextImage.src = next;
  };

  image.classList.add(IMAGE_CLASS);
  image.setAttribute(IMAGE_ATTR, 'true');
  image.removeAttribute('loading');
  image.setAttribute('decoding', 'async');
  wrapper.setAttribute('aria-busy', 'true');
  image.replaceWith(wrapper);
  const error = createError(image.getAttribute('alt') || t('chat.imageLabel'), retry);
  wrapper.append(loading, image, error);
  setLoading();
  if (image.complete) {
    if (image.naturalWidth > 0) setLoaded();
    else setError();
  } else {
    addListeners(image);
  }
};

/**
 * 包装 Markdown 中的图片；保留原始 img 属性，只补充加载与错误状态。
 */
export const enhanceMarkdownImages = (root: HTMLElement): void => {
  root.querySelectorAll<HTMLImageElement>(`img:not([${IMAGE_ATTR}])`).forEach(enhanceImage);
};
