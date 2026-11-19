<template>
  <section class="nh-appearance">
    <div class="nh-appearance__group">
      <p class="nh-appearance__group-title">{{ t('app.theme') }}</p>

      <div class="nh-appearance__options" role="radiogroup" :aria-label="t('app.theme')">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          role="radio"
          class="nh-theme-option"
          :class="{ 'nh-theme-option--selected': themeSource === option.value }"
          :aria-checked="themeSource === option.value"
          @click="changeTheme(option.value)"
        >
          <span class="nh-theme-option__icon">
            <AppIcon :name="option.icon" :size="18" />
          </span>
          <span class="nh-theme-option__label">{{ option.label }}</span>
          <span v-if="themeSource === option.value" class="nh-theme-option__check">
            <AppIcon name="check" :size="14" />
          </span>
        </button>
      </div>

      <p class="nh-appearance__hint">{{ t('settings.themeHint') }}</p>
    </div>

    <div v-if="skinOptions.length" class="nh-appearance__group nh-appearance__skin-group">
      <p class="nh-appearance__group-title">{{ t('settings.skin') }}</p>
      <NSelect
        :value="selectedSkinValue"
        :options="skinOptions"
        :placeholder="t('settings.skinNone')"
        @update:value="changeSkin"
      />
      <p class="nh-appearance__hint">{{ t('settings.skinHint') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 外观设置：主题来源选择，修改后由主进程广播实际主题。
 */

import { computed, onMounted, ref } from 'vue';
import { NSelect, useMessage, type SelectOption } from 'naive-ui';
import type { ThemeSource } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { usePluginRuntimeStore } from '@/plugin-runtime/runtime.store';
import { getThemeInfo, setThemeSource } from '../api/settings.api';

const message = useMessage();
const pluginRuntime = usePluginRuntimeStore();
const themeSource = ref<ThemeSource>('system');

const skinOptions = computed<SelectOption[]>(() => [
  { label: t('settings.skinNone'), value: '' },
  ...pluginRuntime.skins.map((skin) => ({
    label: `${skin.title} · ${skin.pluginName}`,
    value: `${skin.pluginId}:${skin.id}`
  }))
]);

const selectedSkinValue = computed(() =>
  pluginRuntime.selectedSkin
    ? `${pluginRuntime.selectedSkin.pluginId}:${pluginRuntime.selectedSkin.skinId}`
    : ''
);

const options = computed<
  Array<{ value: ThemeSource; label: string; icon: 'monitor' | 'sun' | 'moon' }>
>(() => [
  { value: 'system', label: t('settings.themeSystem'), icon: 'monitor' },
  { value: 'light', label: t('settings.themeLight'), icon: 'sun' },
  { value: 'dark', label: t('settings.themeDark'), icon: 'moon' }
]);

/**
 * 读取当前主题来源。
 */
const load = async (): Promise<void> => {
  try {
    themeSource.value = (await getThemeInfo()).source;
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

/**
 * 切换主题来源；失败时恢复原选择。
 */
const changeSkin = async (value: string): Promise<void> => {
  const [pluginId, skinId] = value.split(':');
  await pluginRuntime.selectSkin(pluginId && skinId ? { pluginId, skinId } : null);
};

const changeTheme = async (value: ThemeSource): Promise<void> => {
  if (themeSource.value === value) return;
  const previous = themeSource.value;
  themeSource.value = value;
  try {
    await setThemeSource(value);
  } catch (reason) {
    themeSource.value = previous;
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-appearance {
  display: flex;
  flex-direction: column;
}

.nh-appearance__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nh-appearance__skin-group {
  margin-top: 24px;
}

.nh-appearance__group-title {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-appearance__options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.nh-theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--nh-color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
  color: var(--nh-color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--nh-duration-fast) var(--nh-ease-standard),
    border-color var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-theme-option:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 45%, var(--nh-color-border));
  background: color-mix(in srgb, var(--nh-color-accent) 3%, var(--nh-color-bg-base));
}

.nh-theme-option:focus-visible {
  outline: 2px solid var(--nh-color-accent);
  outline-offset: 2px;
}

.nh-theme-option--selected {
  border-color: var(--nh-color-accent);
  background: color-mix(in srgb, var(--nh-color-accent) 6%, var(--nh-color-bg-base));
}

.nh-theme-option__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-theme-option--selected .nh-theme-option__icon {
  background: color-mix(in srgb, var(--nh-color-accent) 12%, transparent);
  color: var(--nh-color-accent);
}

.nh-theme-option__label {
  min-width: 0;
  flex: 1;
  font-size: 14px;
}

.nh-theme-option__check {
  flex: none;
  color: var(--nh-color-accent);
}

.nh-appearance__hint {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
