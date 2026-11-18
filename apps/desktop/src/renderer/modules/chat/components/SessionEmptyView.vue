<template>
  <section class="nh-session-empty">
    <div class="nh-session-empty__inner">
      <div class="nh-session-empty__heading">
        <span class="nh-session-empty__icon">
          <AppIcon name="spark" :size="18" />
        </span>
        <div class="nh-session-empty__copy">
          <h1 class="nh-session-empty__title">{{ t('chat.emptySessionTitle') }}</h1>
          <p class="nh-session-empty__hint">{{ t('chat.emptySessionHint') }}</p>
        </div>
      </div>

      <ComposerBox
        class="nh-session-empty__composer"
        hero
        :disabled="Boolean(disabledReason)"
        :disabled-reason="disabledReason"
        :running="running"
        :root-label="rootLabel"
        :roots="roots"
        :providers="providers"
        :models="models"
        :mode="mode"
        :provider-id="providerId"
        :model-id="modelId"
        @choose-root="emit('choose-root')"
        @remove-root="emit('remove-root', $event)"
        @update-provider="emit('update-provider', $event)"
        @update-model="emit('update-model', $event)"
        @update-mode="emit('update-mode', $event)"
        @open-settings="emit('open-settings')"
        @send="emit('send', $event)"
        @stop="emit('stop')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 会话内空状态：一条简短提示与主输入区。
 */

import type { AgentMode, ProviderModel, ProviderPublic, SessionRoot } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import ComposerBox from './ComposerBox.vue';

defineProps<{
  disabledReason?: string | undefined;
  running: boolean;
  rootLabel: string;
  roots: SessionRoot[];
  providers: ProviderPublic[];
  models: ProviderModel[];
  mode: AgentMode;
  providerId?: string | undefined;
  modelId?: string | undefined;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  stop: [];
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
  'open-settings': [];
}>();
</script>

<style scoped lang="less">
.nh-session-empty {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 32px;
  isolation: isolate;
}

.nh-session-empty::before {
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

.nh-session-empty::after {
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

.nh-session-empty__inner {
  display: flex;
  width: 100%;
  max-width: 1040px;
  flex-direction: column;
  gap: 32px;
  animation: session-empty-in var(--nh-duration-panel) var(--nh-ease-standard) both;
}

.nh-session-empty__heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nh-session-empty__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

.nh-session-empty__copy {
  min-width: 0;
}

.nh-session-empty__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.nh-session-empty__hint {
  margin: 4px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 14px;
}

.nh-session-empty__composer {
  margin: 0;
  width: 100%;
  max-width: none;
  animation: composer-in var(--nh-duration-panel) var(--nh-duration-fast) var(--nh-ease-standard)
    both;
}

@keyframes session-empty-in {
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
</style>
