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
    <path v-else-if="name === 'file'" d="M7 3h7l4 4v14H7zM14 3v5h5" />
    <path v-else-if="name === 'terminal'" d="m4 7 4 4-4 4M12 17h8" />
    <path v-else-if="name === 'edit'" d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
    <path v-else-if="name === 'shield'" d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
    <path v-else-if="name === 'history'" d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 8v4l3 2" />
    <path
      v-else-if="name === 'sun'"
      d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
    />
    <path v-else-if="name === 'moon'" d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    <path v-else-if="name === 'monitor'" d="M4 5h16v11H4zM9 20h6M12 16v4" />
    <path v-else d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />
  </svg>
</template>

<script setup lang="ts">
/**
 * 极简线性图标；只依赖 currentColor，跟随主题与按钮状态。
 */

withDefaults(
  defineProps<{
    name:
      | 'folder'
      | 'plus'
      | 'send'
      | 'stop'
      | 'spark'
      | 'file'
      | 'terminal'
      | 'edit'
      | 'shield'
      | 'history'
      | 'sun'
      | 'moon'
      | 'monitor';
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
