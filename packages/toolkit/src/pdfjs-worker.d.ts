/**
 * pdfjs-dist 的 worker 入口没有随包提供类型声明；这里只声明主线程注入所需的模块形状。
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
