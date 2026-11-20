/**
 * 媒体下载拦截：Naive UI 图片预览的下载按钮会创建没有 download 属性的 blob 链接，
 * Electron 会直接导航到该链接并黑屏。这里拦截 blob/data 链接，交给应用另存为。
 */
export type MediaDownloadHandler = () => Promise<void>;

const handlers = new Map<string, MediaDownloadHandler>();
let installed = false;

const onDocumentClick = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (!href.startsWith('blob:') && !href.startsWith('data:')) return;
  if (anchor.hasAttribute('download')) return;

  event.preventDefault();
  event.stopPropagation();

  const handler = handlers.get(href);
  if (handler) {
    handler().catch(() => undefined);
    return;
  }

  // 没有关联文件时也强制走下载，避免导航导致页面黑屏
  anchor.setAttribute('download', 'download');
  anchor.click();
};

const install = (): void => {
  if (installed) return;
  document.addEventListener('click', onDocumentClick, true);
  installed = true;
};

/**
 * 注册某个 blob/data URL 的另存为处理；返回清理函数。
 */
export const registerMediaDownload = (
  url: string,
  handler: MediaDownloadHandler
): (() => void) => {
  install();
  handlers.set(url, handler);
  return () => {
    handlers.delete(url);
  };
};
