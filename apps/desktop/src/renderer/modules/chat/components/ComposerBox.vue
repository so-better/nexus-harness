<template>
  <form class="nh-composer" @submit.prevent="submit">
    <textarea
      v-model="draft"
      class="nh-composer__input"
      rows="2"
      :placeholder="placeholder"
      :disabled="disabled || running"
      @keydown.enter.exact.prevent="submit"
    />
    <div class="nh-composer__actions">
      <span class="nh-composer__hint">{{ disabledReason }}</span>
      <button v-if="running" type="button" class="nh-composer__button" @click="emit('stop')">
        {{ t('app.stop') }}
      </button>
      <button
        v-else
        type="submit"
        class="nh-composer__button nh-composer__button--primary"
        :disabled="disabled || !draft.trim()"
      >
        {{ t('app.send') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * 输入区：Enter 发送、Shift+Enter 换行，运行中显示停止按钮。
 */

import { computed, ref } from 'vue';
import { t } from '@/app/i18n';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
}>();

const emit = defineEmits<{ send: [prompt: string]; stop: [] }>();

const draft = ref('');
const placeholder = computed(() => t('chat.composerPlaceholder'));

/**
 * 提交非空消息并清空输入。
 */
const submit = (): void => {
  const prompt = draft.value.trim();
  if (!prompt || props.disabled || props.running) return;
  draft.value = '';
  emit('send', prompt);
};
</script>

<style scoped lang="less">
.nh-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 12px 24px 16px;
  border-top: 1px solid var(--nh-color-border);
}

.nh-composer__input {
  width: 100%;
  min-height: 64px;
  max-height: 200px;
  resize: vertical;
  padding: 12px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-md);
  background: var(--nh-color-bg-base);
  line-height: 1.6;
}

.nh-composer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--nh-space-sm);
}

.nh-composer__hint {
  flex: 1;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-composer__button {
  padding: 8px 16px;
  border: 1px solid var(--nh-color-border);
  border-radius: var(--nh-radius-sm);
  background: transparent;
}

.nh-composer__button--primary {
  border-color: var(--nh-color-accent);
  color: var(--nh-color-accent);
}

.nh-composer__button:disabled {
  color: var(--nh-color-text-disabled);
}
</style>
