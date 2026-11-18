<template>
  <section class="nh-welcome">
    <div class="nh-welcome__inner">
      <div class="nh-welcome__copy">
        <p class="nh-welcome__eyebrow">{{ t('welcome.eyebrow') }}</p>
        <h1 class="nh-welcome__title">{{ t('welcome.title') }}</h1>
        <p class="nh-welcome__description">{{ t('welcome.description') }}</p>
      </div>

      <div class="nh-welcome__flow">
        <article v-for="(item, index) in capabilities" :key="item.title" class="nh-flow__step">
          <div class="nh-flow__head">
            <span class="nh-flow__icon">
              <AppIcon :name="item.icon" :size="18" />
            </span>
            <span class="nh-flow__index">0{{ index + 1 }}</span>
          </div>
          <h2 class="nh-flow__title">{{ item.title }}</h2>
          <p class="nh-flow__description">{{ item.description }}</p>
        </article>
      </div>

      <ComposerBox
        class="nh-welcome__composer"
        hero
        :disabled="Boolean(disabledReason)"
        :disabled-reason="disabledReason"
        :running="running"
        :root-label="rootLabel"
        :providers="providers"
        :provider-id="providerId"
        @choose-root="emit('choose-root')"
        @update-provider="emit('update-provider', $event)"
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

import { computed } from 'vue';
import type { ProviderPublic } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import ComposerBox from './ComposerBox.vue';

defineProps<{
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  providers: ProviderPublic[];
  providerId?: string | undefined;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'update-provider': [id: string];
}>();

const capabilities = computed(() => [
  {
    icon: 'file' as const,
    title: t('welcome.read'),
    description: t('welcome.readDesc')
  },
  {
    icon: 'edit' as const,
    title: t('welcome.write'),
    description: t('welcome.writeDesc')
  },
  {
    icon: 'terminal' as const,
    title: t('welcome.run'),
    description: t('welcome.runDesc')
  },
  {
    icon: 'history' as const,
    title: t('welcome.rollback'),
    description: t('welcome.rollbackDesc')
  }
]);
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
  mask-image: radial-gradient(circle at 50% 42%, #000 0%, transparent 68%);
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
  animation: welcome-in 480ms var(--nh-ease-standard) both;
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

.nh-welcome__flow {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 58%, transparent);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.nh-flow__step {
  padding: 16px;
  transition: background var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-flow__step + .nh-flow__step {
  border-left: 1px solid var(--nh-color-border);
}

.nh-flow__step:hover {
  background: color-mix(in srgb, var(--nh-color-bg-base) 70%, transparent);
}

.nh-flow__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.nh-flow__icon {
  color: var(--nh-color-accent);
}

.nh-flow__index {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-flow__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.nh-flow__description {
  margin: 4px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  text-wrap: pretty;
}

.nh-welcome__composer {
  margin: 0;
  max-width: none;
  width: 100%;
  animation: composer-in 520ms 80ms var(--nh-ease-standard) both;
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

  .nh-welcome__flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nh-flow__step:nth-child(3),
  .nh-flow__step:nth-child(4) {
    border-top: 1px solid var(--nh-color-border);
  }

  .nh-flow__step:nth-child(3) {
    border-left: 0;
  }
}
</style>
