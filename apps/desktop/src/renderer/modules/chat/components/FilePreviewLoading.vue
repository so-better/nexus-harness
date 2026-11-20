<template>
  <div class="nh-preview-loading" role="status" aria-live="polite">
    <div class="nh-preview-loading__surface" :class="`nh-preview-loading__surface--${kind}`">
      <template v-if="kind === 'text'">
        <div class="nh-preview-loading__gutter" aria-hidden="true">
          <span v-for="line in 24" :key="line" />
        </div>
        <div class="nh-preview-loading__lines" aria-hidden="true">
          <span v-for="(width, index) in lineWidths" :key="`${index}-${width}`" :style="{ width }" />
        </div>
      </template>
      <div v-else class="nh-preview-loading__media" aria-hidden="true">
        <AppIcon :name="kind === 'video' ? 'play' : 'image'" :size="32" />
      </div>
      <span class="nh-preview-loading__shimmer" aria-hidden="true" />
      <span class="nh-preview-loading__progress" aria-hidden="true" />
    </div>
    <div class="nh-preview-loading__status">
      <span class="nh-preview-loading__dot" aria-hidden="true" />
      <span>{{ t('common.loading') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 文件预览加载骨架：文本、图片、视频分别使用不同的占位形态。
 */

import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ kind: 'image' | 'video' | 'text' }>();

const lineWidths = [
  '78%', '56%', '88%', '64%', '92%', '48%', '72%', '84%', '60%', '40%',
  '86%', '52%', '74%', '90%', '58%', '66%', '80%', '46%', '88%', '62%',
  '74%', '50%', '82%', '38%'
];
</script>

<style scoped lang="less" src="./FilePreviewLoading.less"></style>

