<template>
  <NModal
    :show="show"
    preset="card"
    class="nh-settings"
    style="width: min(760px, calc(100vw - 48px))"
    :title="t('settings.title')"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <NTabs v-if="show" default-value="provider" type="line" animated>
      <NTabPane name="provider" :tab="t('settings.provider')">
        <p class="nh-settings__hint">{{ t('settings.providerHint') }}</p>
        <ProviderSettingsPanel @changed="emit('changed')" />
      </NTabPane>

      <NTabPane name="general" :tab="t('settings.general')">
        <GeneralSettings :version="version" />
      </NTabPane>

      <NTabPane name="appearance" :tab="t('settings.appearance')">
        <div class="nh-settings__section">
          <p class="nh-settings__label">{{ t('app.theme') }}</p>
          <NRadioGroup :value="themeSource" size="small" @update:value="changeTheme">
            <NRadioButton value="system">{{ t('settings.themeSystem') }}</NRadioButton>
            <NRadioButton value="light">{{ t('settings.themeLight') }}</NRadioButton>
            <NRadioButton value="dark">{{ t('settings.themeDark') }}</NRadioButton>
          </NRadioGroup>
        </div>
      </NTabPane>

      <NTabPane name="cache" :tab="t('settings.cache')">
        <CacheSettings :busy="busy" />
      </NTabPane>
    </NTabs>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 设置弹窗：模型提供商、通用、外观与缓存。
 */

import { ref, watch } from 'vue';
import { NModal, NRadioButton, NRadioGroup, NTabPane, NTabs } from 'naive-ui';
import type { ThemeSource } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import CacheSettings from './CacheSettings.vue';
import GeneralSettings from './GeneralSettings.vue';
import ProviderSettingsPanel from './ProviderSettingsPanel.vue';
import { getThemeInfo, setThemeSource } from '../api/settings.api';

const props = defineProps<{
  show: boolean;
  version: string;
  busy: boolean;
}>();

const emit = defineEmits<{ 'update:show': [show: boolean]; changed: [] }>();

const themeSource = ref<ThemeSource>('system');

/**
 * 打开设置时同步当前主题来源。
 */
watch(
  () => props.show,
  async (show) => {
    if (!show) return;
    try {
      themeSource.value = (await getThemeInfo()).source;
    } catch {
      // 主题读取失败不影响设置弹窗其他区域
    }
  },
  { immediate: true }
);

/**
 * 切换主题来源，主进程会广播实际生效主题。
 */
const changeTheme = async (value: string): Promise<void> => {
  themeSource.value = value as ThemeSource;
  try {
    await setThemeSource(themeSource.value);
  } catch {
    // 设置失败时保留当前选择，由后续读取纠正
  }
};
</script>

<style scoped lang="less">
.nh-settings {
  width: min(760px, calc(100vw - 48px));
}

.nh-settings__hint {
  margin: 0 0 16px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-settings__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-settings__label {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
