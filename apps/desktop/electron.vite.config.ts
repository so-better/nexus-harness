/**
 * electron-vite 构建配置：主进程、preload 与渲染进程共用 @shared 别名。
 */

import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

const sharedSrc = resolve(__dirname, '../../packages/shared/src');
const coreSrc = resolve(__dirname, '../../packages/core/src');
const providersSrc = resolve(__dirname, '../../packages/providers/src');
const toolkitSrc = resolve(__dirname, '../../packages/toolkit/src');
const runtimeUtilsSrc = resolve(__dirname, '../../packages/runtime-utils/src');
const rendererRoot = resolve(__dirname, 'src/renderer');
const toolkitFonts = resolve(__dirname, '../../packages/toolkit/assets/fonts');

const copyToolkitFonts = {
  name: 'copy-toolkit-fonts',
  closeBundle: (): void => {
    const destination = resolve(__dirname, 'out/assets/fonts');
    mkdirSync(destination, { recursive: true });
    cpSync(toolkitFonts, destination, { recursive: true });
  }
};

export default defineConfig({
  main: {
    plugins: [copyToolkitFonts],
    ssr: {
      noExternal: true
    },
    resolve: {
      alias: {
        '@nexus/core': coreSrc,
        '@nexus/providers': providersSrc,
        '@nexus/toolkit': toolkitSrc,
        '@nexus/runtime-utils': runtimeUtilsSrc,
        '@shared': sharedSrc
      }
    },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron', 'node-pty']
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
