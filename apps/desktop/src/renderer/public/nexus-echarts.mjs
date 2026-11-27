// 共享模块 shim：echarts 懒加载器（见 app/plugin-shared.ts）。
// 由 apps/desktop/scripts/gen-nexus-shims.mjs 生成，请勿手改。
const __ns = (window.__nexusShared ?? {}).echarts ?? {};
export const loadEcharts = __ns.load;
