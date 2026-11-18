<template>
  <section class="nh-hero">
    <div class="nh-hero__mark">
      <AppIcon name="spark" :size="24" />
    </div>
    <p class="nh-hero__eyebrow">{{ t('app.emptyEyebrow') }}</p>
    <h1 class="nh-hero__title">{{ t('app.emptyTitle') }}</h1>
    <p class="nh-hero__description">{{ t('app.emptyDescription') }}</p>

    <div class="nh-hero__steps">
      <div class="nh-hero__step">
        <span class="nh-hero__step-number">01</span>
        <span>{{ t('app.stepRoot') }}</span>
      </div>
      <div class="nh-hero__step">
        <span class="nh-hero__step-number">02</span>
        <span>{{ t('app.stepModel') }}</span>
      </div>
      <div class="nh-hero__step">
        <span class="nh-hero__step-number">03</span>
        <span>{{ t('app.stepTask') }}</span>
      </div>
    </div>

    <NButton v-if="showCreate" type="primary" size="medium" @click="emit('create')">
      <template #icon>
        <AppIcon name="plus" />
      </template>
      {{ t('app.newSession') }}
    </NButton>
    <p v-else class="nh-hero__hint">{{ t('app.emptyHint') }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * 空状态：把首次使用引导做成克制的品牌时刻，而不是默认 Empty 插图。
 */

import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ showCreate: boolean }>();

const emit = defineEmits<{ create: [] }>();
</script>

<style scoped lang="less">
.nh-hero {
  display: flex;
  max-width: 520px;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.nh-hero__mark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: var(--nh-color-bg-elevated);
  color: var(--nh-color-accent);
  box-shadow: var(--nh-highlight);
}

.nh-hero__eyebrow {
  margin: 16px 0 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  letter-spacing: 0.14em;
}

.nh-hero__title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.nh-hero__description {
  max-width: 420px;
  margin: 12px 0 0;
  color: var(--nh-color-text-secondary);
  line-height: 1.7;
  text-wrap: pretty;
}

.nh-hero__steps {
  display: flex;
  gap: 8px;
  margin: 24px 0;
  padding: 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: var(--nh-color-bg-elevated);
}

.nh-hero__step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-hero__step + .nh-hero__step {
  border-left: 1px solid var(--nh-color-border);
}

.nh-hero__step-number {
  color: var(--nh-color-accent);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-hero__hint {
  margin: 0;
  color: var(--nh-color-text-disabled);
  font-size: 12px;
}
</style>
