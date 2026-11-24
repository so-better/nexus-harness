<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('changelog.title')"
    :bordered="false"
    style="width: min(760px, calc(100vw - 48px))"
    @update:show="emit('update:show', $event)"
  >
    <div class="nh-changelog" v-html="html" />
  </NModal>
</template>

<script setup lang="ts">
/**
 * 更新日志弹窗：渲染仓库根目录 CHANGELOG.md 的 Markdown 内容。
 */

import { computed } from 'vue';
import { NModal } from 'naive-ui';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { locale, t } from '@/app/i18n';
import { changelogContent } from '@/app/changelog';

defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [show: boolean] }>();

const content = computed(() =>
  locale.value === 'zh-CN' ? changelogContent['zh-CN'] : changelogContent.en
);
const html = computed(() => DOMPurify.sanitize(marked.parse(content.value) as string));
</script>

<style scoped lang="less">
.nh-changelog {
  max-height: min(64vh, 640px);
  overflow: auto;
  padding-right: 6px;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  line-height: 1.65;
}

.nh-changelog :deep(h1),
.nh-changelog :deep(h2),
.nh-changelog :deep(h3) {
  margin: 0 0 12px;
  font-weight: 600;
  line-height: 1.35;
}

.nh-changelog :deep(h1) {
  font-size: 24px;
}

.nh-changelog :deep(h2) {
  margin-top: 24px;
  font-size: 17px;
}

.nh-changelog :deep(h3) {
  margin-top: 16px;
  font-size: 14px;
}

.nh-changelog :deep(p),
.nh-changelog :deep(ul) {
  margin: 0 0 12px;
}

.nh-changelog :deep(ul) {
  padding-left: 20px;
}

.nh-changelog :deep(li) {
  margin: 3px 0;
}

.nh-changelog :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--nh-surface-hover);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-changelog :deep(a) {
  color: var(--nh-color-accent);
}

.nh-changelog :deep(hr) {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid var(--nh-border-subtle);
}
</style>
