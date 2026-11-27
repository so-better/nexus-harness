/**
 * 生成插件共享模块 shim：src/renderer/public/nexus-{vue,naive-ui,theme,echarts}.mjs。
 * vue/theme 复用宿主已加载实例；naive-ui/echarts 用顶层 await 懒加载（见 app/plugin-shared.ts）。
 * 供插件通过导入映射 `nexus/vue`、`nexus/naive-ui`、`nexus/theme`、`nexus/echarts` 引用。
 * 用法：node apps/desktop/scripts/gen-nexus-shims.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vue from 'vue';
import * as naiveUi from 'naive-ui';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/renderer/public');
mkdirSync(outDir, { recursive: true });

const ident = (name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && name !== 'default';
const emit = (expr, names) => names.map((name) => `export const ${name} = ${expr}.${name};`).join('\n');

const vueNames = Object.keys(vue).filter(ident).sort();
const naiveNames = Object.keys(naiveUi).filter(ident).sort();
// 主题调色板导出（宿主 app/theme-palette.ts），供插件统一主题；名称手维护。
// 不含 getNaiveOverrides：其值含 var()，直接给 NConfigProvider 会触发 seemly 解析报错。
const themeNames = ['getPalette', 'applyPalette', 'lightPalette', 'darkPalette'];

const syncHeader = (ns) =>
  `// 共享模块 shim：从宿主 window.__nexusShared 复用同一份实例（见 app/plugin-shared.ts）。\n// 由 apps/desktop/scripts/gen-nexus-shims.mjs 生成，请勿手改。\nconst __ns = (window.__nexusShared ?? {}).${ns} ?? {};\n`;
const lazyHeader = (ns) =>
  `// 共享模块 shim：顶层 await 懒加载宿主模块（见 app/plugin-shared.ts）。\n// 由 apps/desktop/scripts/gen-nexus-shims.mjs 生成，请勿手改。\nconst __ns = await ((window.__nexusShared ?? {}).${ns} ?? { load: async () => ({}) }).load();\n`;

writeFileSync(resolve(outDir, 'nexus-vue.mjs'), syncHeader('vue') + emit('__ns', vueNames) + '\n');
writeFileSync(
  resolve(outDir, 'nexus-naive-ui.mjs'),
  lazyHeader('naiveUi') + emit('__ns', naiveNames) + '\n'
);
writeFileSync(resolve(outDir, 'nexus-theme.mjs'), syncHeader('theme') + emit('__ns', themeNames) + '\n');
writeFileSync(
  resolve(outDir, 'nexus-echarts.mjs'),
  `// 共享模块 shim：echarts 懒加载器（见 app/plugin-shared.ts）。\n// 由 apps/desktop/scripts/gen-nexus-shims.mjs 生成，请勿手改。\nconst __ns = (window.__nexusShared ?? {}).echarts ?? {};\nexport const loadEcharts = __ns.load;\n`
);
console.log(
  `generated nexus-vue.mjs (${vueNames.length}) / nexus-naive-ui.mjs (${naiveNames.length}) / nexus-theme.mjs (${themeNames.length}) / nexus-echarts.mjs`
);
