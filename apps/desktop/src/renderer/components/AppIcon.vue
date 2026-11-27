<template>
  <svg
    class="nh-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
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
    <path
      v-else-if="name === 'paperclip'"
      d="M21 11.5l-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"
    />
    <path v-else-if="name === 'image'" d="M4 5h16v14H4zM7 15l3-3 2 2 3-3 3 3M8 9h.01" />
    <path
      v-else-if="name === 'eye'"
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
    />
    <path v-else-if="name === 'export'" d="M12 15V3M7 8l5-5 5 5M5 15v5h14v-5" />
    <path v-else-if="name === 'upload'" d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    <path v-else-if="name === 'download'" d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    <path
      v-else-if="name === 'terminal'"
      d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 9l3 3-3 3M13 15h4"
    />
    <path v-else-if="name === 'edit'" d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
    <path v-else-if="name === 'history'" d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6M4 4v4.6h4.6M12 8v4l3 2" />
    <path v-else-if="name === 'settings'" d="M4 7h8M16 7h4M4 17h4M12 17h8M12 5v4M8 15v4" />
    <path
      v-else-if="name === 'sun'"
      d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
    />
    <path v-else-if="name === 'moon'" d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    <path v-else-if="name === 'monitor'" d="M4 5h16v11H4zM9 20h6M12 16v4" />
    <path v-else-if="name === 'chevron-left'" d="m15 6-6 6 6 6" />
    <path v-else-if="name === 'chevron-right'" d="m9 6 6 6-6 6" />
    <g v-else-if="name === 'panel-collapse'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m16 9-3 3 3 3" />
    </g>
    <g v-else-if="name === 'panel-expand'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="m13 9 3 3-3 3" />
    </g>
    <path
      v-else-if="name === 'database'"
      d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"
    />
    <g v-else-if="name === 'key'">
      <path
        d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
      />
      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
    </g>
    <path
      v-else-if="name === 'globe'"
      d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.4 2.5 3.8 5.5 3.8 9S14.4 18.5 12 21c-2.4-2.5-3.8-5.5-3.8-9S9.6 5.5 12 3Z"
    />
    <path v-else-if="name === 'power'" d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" />
    <path
      v-else-if="name === 'bell'"
      d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"
    />
    <path v-else-if="name === 'alert'" d="M12 3 2 21h20L12 3ZM12 9v5M12 17h.01" />
    <path v-else-if="name === 'close'" d="m6 6 12 12M18 6 6 18" />
    <path v-else-if="name === 'search'" d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16 16l4 4" />
    <path v-else-if="name === 'message'" d="M4 5h16v11H9l-4 4v-4H4z" />
    <path v-else-if="name === 'more'" d="M5 12h.01M12 12h.01M19 12h.01" />
    <path v-else-if="name === 'pin'" d="M9 4h6l-1 6 4 4H6l4-4-1-6ZM12 14v7" />
    <path v-else-if="name === 'play'" d="M8 5v14l11-7Z" />
    <path v-else-if="name === 'info'" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8h.01" />
    <path v-else-if="name === 'trash'" d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6" />
    <path v-else-if="name === 'chevron-down'" d="m6 9 6 6 6-6" />
    <path v-else-if="name === 'chevron-up'" d="m6 15 6-6 6 6" />
    <path v-else-if="name === 'arrow-up'" d="M12 19V5M6 11l6-6 6 6" />
    <path v-else-if="name === 'arrow-down'" d="M12 5v14M18 13l-6 6-6-6" />
    <path v-else-if="name === 'plug'" d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v5" />
    <path
      v-else-if="name === 'spark'"
      d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"
    />
    <path v-else-if="name === 'loader'" d="M21 12a9 9 0 1 1-6.2-8.56" />
    <path
      v-else-if="name === 'lightbulb'"
      d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"
    />
    <path
      v-else-if="name === 'brain'"
      d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"
    />
    <path v-else-if="name === 'minimize'" d="M5 12h14" />
    <path v-else-if="name === 'maximize'" d="M6 6h12v12H6z" />
    <path v-else-if="name === 'restore'" d="M8 8h9v9H8zM5 16V5h11" />
    <path
      v-else-if="name === 'copy'"
      d="M8 8h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2ZM4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
    />
    <path
      v-else-if="name === 'refresh'"
      d="M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.2-2.6L20 9M4 15l2.7 2.6A7 7 0 0 0 17.9 15"
    />
    <path v-else-if="name === 'regenerate'" d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
    <path v-else d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />
  </svg>
</template>

<script lang="ts">
/** 图标名称清单；供插件等外部代码做运行时校验。 */
export const APP_ICON_NAMES = [
  'folder',
  'plus',
  'send',
  'stop',
  'spark',
  'file',
  'paperclip',
  'image',
  'eye',
  'export',
  'upload',
  'download',
  'terminal',
  'edit',
  'history',
  'settings',
  'sun',
  'moon',
  'monitor',
  'chevron-down',
  'chevron-up',
  'arrow-up',
  'arrow-down',
  'chevron-left',
  'chevron-right',
  'globe',
  'key',
  'database',
  'power',
  'alert',
  'bell',
  'close',
  'pin',
  'play',
  'message',
  'search',
  'more',
  'info',
  'trash',
  'check',
  'refresh',
  'regenerate',
  'copy',
  'plug',
  'minimize',
  'maximize',
  'restore',
  'loader',
  'brain',
  'lightbulb',
  'panel-collapse',
  'panel-expand'
] as const;
export type AppIconName = (typeof APP_ICON_NAMES)[number];
</script>

<script setup lang="ts">
/**
 * 极简线性图标；只依赖 currentColor，跟随主题与按钮状态。
 */

withDefaults(
  defineProps<{
    name: AppIconName;
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
