/**
 * 外部链接点击判定：http/https 与 mailto 外开，媒体 blob/data 交给下载逻辑，
 * 其他协议与相对链接阻止应用内导航。
 */
export type ExternalLinkOpener = (href: string) => void;

export const isExternalHref = (href: string): boolean =>
  /^(https?:\/\/|mailto:)/i.test(href);

export const handleAnchorClick = (
  event: MouseEvent,
  openExternal: ExternalLinkOpener
): void => {
  if (event.defaultPrevented || event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  if (!href || href.startsWith('#')) return;
  if (anchor.hasAttribute('download')) return;
  if (href.startsWith('blob:') || href.startsWith('data:')) return;

  event.preventDefault();
  event.stopPropagation();

  if (isExternalHref(href)) openExternal(href);
};
