/**
 * 应用内消息（toast）桥：把 Naive UI 的 message API 暴露给插件运行时。
 * 该 API 必须在 NMessageProvider 内注册（MainLayout 中完成）。
 */

type ToastLevel = 'info' | 'warning' | 'error';

interface ToastApi {
  info: (text: string) => void;
  warning: (text: string) => void;
  error: (text: string) => void;
}

let api: ToastApi | undefined;

/**
 * 注册应用内消息 API（由 MainLayout 在挂载时调用）。
 */
export const setAppMessageApi = (instance: ToastApi | undefined): void => {
  api = instance;
};

/**
 * 弹出一条应用内消息。
 */
export const showAppMessage = (text: string, level: ToastLevel = 'info'): void => {
  // 应用尚未挂载完成（未注册 message provider）时静默丢弃，避免插件激活早期报错
  if (!api) return;
  if (level === 'error') api.error(text);
  else if (level === 'warning') api.warning(text);
  else api.info(text);
};
