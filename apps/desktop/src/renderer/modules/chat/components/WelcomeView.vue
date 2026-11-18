<template>
  <section class="nh-welcome">
    <div class="nh-welcome__inner">
      <div class="nh-welcome__copy">
        <p class="nh-welcome__eyebrow">{{ t('welcome.eyebrow') }}</p>
        <h1 class="nh-welcome__title">{{ t('welcome.title') }}</h1>
        <p class="nh-welcome__description">{{ t('welcome.description') }}</p>
      </div>

      <WelcomeFlow />

      <ComposerBox
        class="nh-welcome__composer"
        hero
        :disabled="Boolean(disabledReason)"
        :disabled-reason="disabledReason"
        :running="running"
        :root-label="rootLabel"
        :providers="providers"
        :models="models"
        :provider-id="providerId"
        :model-id="modelId"
        @choose-root="emit('choose-root')"
        @update-provider="emit('update-provider', $event)"
        @update-model="emit('update-model', $event)"
        @open-settings="emit('open-settings')"
        @send="emit('send', $event)"
        @stop="emit('stop')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 欢迎页：品牌化首屏、能力说明与主输入区。
 */

import type { ProviderModel, ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import ComposerBox from './ComposerBox.vue';
import WelcomeFlow from './WelcomeFlow.vue';

defineProps<{
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  providers: ProviderPublic[];
  models: ProviderModel[];
  providerId?: string | undefined;
  modelId?: string | undefined;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'update-provider': [id: string];
  'update-model': [id: string];
  'open-settings': [];
}>();
</script>

<style scoped lang="less">
.nh-welcome {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 48px;
  isolation: isolate;
}

.nh-welcome::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image:
    linear-gradient(
      to right,
      color-mix(in srgb, var(--nh-color-border) 42%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--nh-color-border) 42%, transparent) 1px,
      transparent 1px
    );
  background-size: 40px 40px;
  content: '';
  mask-image: radial-gradient(circle at 50% 42%, var(--nh-mask) 0%, transparent 68%);
  opacity: 0.55;
  pointer-events: none;
}

.nh-welcome::after {
  position: absolute;
  z-index: -1;
  top: 34%;
  left: 50%;
  width: 640px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--nh-color-accent) 12%, transparent) 0%,
    transparent 68%
  );
  content: '';
  filter: blur(36px);
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.nh-welcome__inner {
  display: flex;
  width: 100%;
  max-width: 860px;
  flex-direction: column;
  gap: 32px;
  animation: welcome-in var(--nh-duration-panel) var(--nh-ease-standard) both;
}

.nh-welcome__eyebrow {
  margin: 0 0 12px;
  color: var(--nh-color-accent);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
}

.nh-welcome__title {
  max-width: 720px;
  margin: 0;
  font-size: clamp(36px, 4.4vw, 56px);
  font-weight: 600;
  letter-spacing: -0.045em;
  line-height: 1.05;
  text-wrap: balance;
}

.nh-welcome__description {
  max-width: 620px;
  margin: 16px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 14px;
  line-height: 1.8;
  text-wrap: pretty;
}

.nh-welcome__composer {
  margin: 0;
  max-width: none;
  width: 100%;
  animation: composer-in var(--nh-duration-panel) var(--nh-duration-fast) var(--nh-ease-standard)
    both;
}

@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@keyframes composer-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@media (width <= 1024px) {
  .nh-welcome {
    padding: 32px;
  }
}
</style>
