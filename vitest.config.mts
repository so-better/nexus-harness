/* Vitest 配置：核心包与主进程纯逻辑的单元测试。 */

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@nexus/core': resolve(process.cwd(), 'packages/core/src/index.ts'),
      '@nexus/providers': resolve(process.cwd(), 'packages/providers/src/index.ts'),
      '@nexus/tools': resolve(process.cwd(), 'packages/tools/src/index.ts'),
      '@shared': resolve(process.cwd(), 'packages/shared/src')
    }
  },
  test: {
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts']
  }
});
