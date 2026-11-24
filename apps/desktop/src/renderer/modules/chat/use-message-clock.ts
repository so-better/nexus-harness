/**
 * 共享消息时钟：让消息时间和日期分隔在跨午夜后自动刷新。
 */

import { onScopeDispose, ref } from 'vue';

const now = ref(Date.now());
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const start = (): void => {
  if (timer) return;
  now.value = Date.now();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
};

const stop = (): void => {
  if (!timer || subscribers > 0) return;
  clearInterval(timer);
  timer = undefined;
};

/**
 * 订阅共享当前时间；组件卸载时自动释放。
 */
export const useMessageClock = () => {
  subscribers += 1;
  start();
  onScopeDispose(() => {
    subscribers = Math.max(0, subscribers - 1);
    stop();
  });
  return now;
};
