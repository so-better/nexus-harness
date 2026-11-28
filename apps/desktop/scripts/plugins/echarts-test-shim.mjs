/**
 * 测试用 echarts 桩：返回最小可用实例，避免在 jsdom 中加载真实 canvas 渲染器。
 */

export const loadEcharts = async () => ({
  init: () => ({
    setOption() {},
    resize() {},
    dispose() {}
  })
});
