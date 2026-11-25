/**
 * 输入区插入总线：插件通过 ctx.composer.insert 把文本插入当前输入框。
 * 由 ComposerBox 在挂载期间订阅，卸载时自动解除。
 */

type InsertHandler = (text: string) => void;

const handlers = new Set<InsertHandler>();

/**
 * 订阅插入请求；返回取消订阅函数。
 */
export const subscribeComposerInsert = (handler: InsertHandler): (() => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

/**
 * 请求把文本插入当前输入框。
 */
export const requestComposerInsert = (text: string): void => {
  for (const handler of handlers) {
    try {
      handler(text);
    } catch {
      // 忽略单个订阅者异常
    }
  }
};
