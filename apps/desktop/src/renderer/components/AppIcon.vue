<template>
  <svg
    class="nh-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-if="name === 'folder'"
      d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
    />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'send'" d="m4 11 16-7-7 16-2-7-7-2Z" />
    <path v-else-if="name === 'stop'" d="M7 7h10v10H7z" fill="currentColor" stroke="none" />
    <path v-else d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />
  </svg>
</template>

<script setup lang="ts">
/**
 * 极简线性图标；只依赖 currentColor，跟随主题与按钮状态。
 */

withDefaults(
  defineProps<{
    name: 'folder' | 'plus' | 'send' | 'stop' | 'spark';
    size?: number;
  }>(),
  { size: 16 }
);
</script>

<style scoped lang="less">
.nh-icon {
  display: block;
  flex: none;
}
</style>
