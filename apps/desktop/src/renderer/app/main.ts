/* 渲染进程入口：挂载空白应用壳，页面结构由后续设计接管。 */

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import '../styles/global.less';

createApp(App).use(createPinia()).mount('#app');
