/* electron-vite 构建配置：主进程、preload 与渲染进程共用 @shared 别名。 */

import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

const sharedSrc = resolve(__dirname, '../../packages/shared/src');
const coreSrc = resolve(__dirname, '../../packages/core/src');
const rendererRoot = resolve(__dirname, 'src/renderer');

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@nexus/core': coreSrc,
        '@shared': sharedSrc
      }
    },
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': sharedSrc
      }
    },
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: rendererRoot,
    resolve: {
      alias: {
        '@': rendererRoot,
        '@shared': sharedSrc
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: resolve(rendererRoot, 'index.html')
      }
    }
  }
});
