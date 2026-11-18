<template>
  <section class="nh-general">
    <div class="nh-general__row">
      <div>
        <p class="nh-general__title">{{ t('settings.autoLaunch') }}</p>
        <p class="nh-general__hint">{{ t('settings.autoLaunchHint') }}</p>
      </div>
      <NSwitch :value="autoLaunch" :loading="loading" @update:value="changeAutoLaunch" />
    </div>

    <NDivider />

    <div class="nh-general__row">
      <NText depth="3">{{ t('settings.version') }}</NText>
      <NText depth="2">{{ version }}</NText>
    </div>

    <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>
  </section>
</template>

<script setup lang="ts">
/**
 * 通用设置：开机自启与版本信息。
 */

import { onMounted, ref } from 'vue';
import { NAlert, NDivider, NSwitch, NText } from 'naive-ui';
import { t } from '@/app/i18n';
import { getAutoLaunch, setAutoLaunch } from '../api/settings.api';

defineProps<{ version: string }>();

const autoLaunch = ref(true);
const loading = ref(false);
const error = ref<string>();

/**
 * 读取当前开机自启状态。
 */
const load = async (): Promise<void> => {
  try {
    autoLaunch.value = await getAutoLaunch();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('settings.loadFailed');
  }
};

/**
 * 更新开机自启状态并持久化。
 */
const changeAutoLaunch = async (value: boolean): Promise<void> => {
  loading.value = true;
  error.value = undefined;
  try {
    autoLaunch.value = await setAutoLaunch(value);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('settings.loadFailed');
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-general {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nh-general__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.nh-general__title,
.nh-general__hint {
  margin: 0;
}

.nh-general__title {
  font-size: 14px;
}

.nh-general__hint {
  margin-top: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}
</style>
