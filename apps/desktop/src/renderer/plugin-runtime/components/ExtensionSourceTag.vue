<template>
  <span class="nh-source-tag" :class="`nh-source-tag--${source}`">
    <span class="nh-source-tag__dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
/**
 * 扩展来源标签：插件与 Skill 共用，内置和用户仅通过颜色区分。
 */
defineProps<{
  source: 'builtin' | 'user';
  label: string;
}>();
</script>

<style scoped lang="less">
.nh-source-tag {
  display: inline-flex;
  height: 22px;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.5;
  white-space: nowrap;
}

.nh-source-tag__dot {
  width: 4px;
  height: 4px;
  flex: none;
  border-radius: 50%;
  background: currentcolor;
  opacity: 0.78;
}

.nh-source-tag--builtin {
  border-color: color-mix(in srgb, var(--nh-color-success) 28%, transparent);
  background: color-mix(in srgb, var(--nh-color-success) 8%, transparent);
  color: color-mix(in srgb, var(--nh-color-success) 78%, var(--nh-color-text-primary));
}

.nh-source-tag--user {
  border-color: color-mix(in srgb, var(--nh-color-accent) 28%, transparent);
  background: color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
  color: color-mix(in srgb, var(--nh-color-accent) 78%, var(--nh-color-text-primary));
}
</style>
