/* Vue 单文件组件类型声明；真实类型检查由 vue-tsc 负责。 */

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}
