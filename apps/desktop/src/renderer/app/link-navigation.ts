/**
 * 全局链接拦截：AI 或 Markdown 里的外部链接不在应用窗口内导航，统一交给系统浏览器。
 * blob/data 交给媒体下载拦截处理；未知协议与相对链接直接阻止，避免黑屏。
 */
import { handleAnchorClick } from './link-handler';
import { nexus } from './nexus-bridge';

let installed = false;

const openExternal = (href: string): void => {
  nexus.app
    .openExternal(href)
    .then((result) => {
      if (!result.ok) console.error('打开外部链接失败', result.error.message);
    })
    .catch((error: unknown) => {
      console.error('打开外部链接失败', error);
    });
};

const onClick = (event: MouseEvent): void => {
  handleAnchorClick(event, openExternal);
};

/**
 * 安装一次全局链接拦截。
 */
export const installLinkNavigation = (): void => {
  if (installed) return;
  installed = true;
  document.addEventListener('click', onClick, true);
};
