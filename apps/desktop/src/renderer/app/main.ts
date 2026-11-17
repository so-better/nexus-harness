/* 渲染进程入口：挂载空白应用壳，页面结构由后续设计接管。 */

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './NexusApp.vue';
import { initTheme } from './theme';
import '../styles/global.less';

initTheme().catch((error: unknown) => {
  console.error('初始化主题失败', error);
});
createApp(App).use(createPinia()).mount('#app');
