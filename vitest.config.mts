/* Vitest 配置：核心包与主进程纯逻辑的单元测试。 */

import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@nexus/core': resolve(process.cwd(), 'packages/core/src/index.ts'),
      '@nexus/providers': resolve(process.cwd(), 'packages/providers/src/index.ts'),
      '@nexus/tools': resolve(process.cwd(), 'packages/tools/src/index.ts'),
      '@shared': resolve(process.cwd(), 'packages/shared/src'),
      '@': resolve(process.cwd(), 'apps/desktop/src/renderer'),
      // 供插件模块测试：把共享模块裸标识符映射到宿主实现
      'nexus/vue': 'vue',
      'nexus/theme': resolve(process.cwd(), 'apps/desktop/src/renderer/app/theme-palette.ts')
    }
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'apps/**/scripts/**/*.test.mjs'
    ]
  }
});
