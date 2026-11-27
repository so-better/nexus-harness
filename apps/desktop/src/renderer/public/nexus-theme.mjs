// 共享模块 shim：从宿主 window.__nexusShared 复用同一份实例（见 app/plugin-shared.ts）。
// 由 apps/desktop/scripts/gen-nexus-shims.mjs 生成，请勿手改。
const __ns = (window.__nexusShared ?? {}).theme ?? {};
export const getPalette = __ns.getPalette;
export const applyPalette = __ns.applyPalette;
export const lightPalette = __ns.lightPalette;
export const darkPalette = __ns.darkPalette;
