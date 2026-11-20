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
    <NTabs default-value="provider" type="line" animated>
      <NTabPane name="provider" :tab="t('settings.provider')">
        <p class="nh-settings__hint">{{ t('settings.providerHint') }}</p>
        <ProviderSettingsPanel @changed="emit('changed')" />
      </NTabPane>

      <NTabPane name="image" :tab="t('settings.image')">
        <p class="nh-settings__hint">{{ t('settings.imageHint') }}</p>
        <ImageSettingsPanel />
      </NTabPane>

      <NTabPane name="general" :tab="t('settings.general')">
        <GeneralSettings :version="version" />
      </NTabPane>

      <NTabPane name="appearance" :tab="t('settings.appearance')">
        <AppearanceSettings />
      </NTabPane>

      <NTabPane name="terminal" :tab="t('settings.terminal')">
        <TerminalSettingsPanel />
      </NTabPane>

      <NTabPane name="cache" :tab="t('settings.cache')">
        <CacheSettings :busy="busy" />
      </NTabPane>

      <NTabPane name="migration" :tab="t('settings.migration')">
        <MigrationSettings :busy="busy" />
      </NTabPane>
    </NTabs>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 设置弹窗：模型提供商、通用、外观与缓存。
 */

import { NModal, NTabPane, NTabs } from 'naive-ui';
import { t } from '@/app/i18n';
import AppearanceSettings from './AppearanceSettings.vue';
import CacheSettings from './CacheSettings.vue';
import GeneralSettings from './GeneralSettings.vue';
import ProviderSettingsPanel from './ProviderSettingsPanel.vue';
import TerminalSettingsPanel from './TerminalSettingsPanel.vue';
import ImageSettingsPanel from './ImageSettingsPanel.vue';
import MigrationSettings from './MigrationSettings.vue';

defineProps<{
  show: boolean;
  version: string;
  busy: boolean;
}>();

const emit = defineEmits<{ 'update:show': [show: boolean]; changed: [] }>();
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
</style>
