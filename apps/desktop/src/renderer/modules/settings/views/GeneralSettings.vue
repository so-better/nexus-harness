<template>
  <section class="nh-general">
    <div class="nh-general__group">
      <p class="nh-general__group-title">{{ t('settings.preferences') }}</p>

      <div class="nh-general__panel">
        <div class="nh-general__row">
          <span class="nh-general__icon">
            <AppIcon name="globe" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.language') }}</p>
            <p class="nh-general__hint">{{ t('settings.languageHint') }}</p>
          </div>
          <NSelect
            class="nh-general__language"
            :value="locale"
            :options="languageOptions"
            :placeholder="t('settings.pleaseSelect')"
            @update:value="changeLanguage"
          />
        </div>

        <div class="nh-general__row nh-general__row--divided">
          <span class="nh-general__icon">
            <AppIcon name="power" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.autoLaunch') }}</p>
            <p class="nh-general__hint">{{ t('settings.autoLaunchHint') }}</p>
          </div>
          <NSwitch :value="autoLaunch" :loading="loading" @update:value="changeAutoLaunch" />
        </div>

        <div class="nh-general__row nh-general__row--divided">
          <span class="nh-general__icon">
            <AppIcon name="bell" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.notificationBadge') }}</p>
            <p class="nh-general__hint">{{ t('settings.notificationBadgeHint') }}</p>
          </div>
          <NSelect
            class="nh-general__language"
            :value="badgeStyle"
            :options="badgeOptions"
            :placeholder="t('settings.pleaseSelect')"
            @update:value="changeBadge"
          />
        </div>
      </div>
    </div>

    <div class="nh-general__group">
      <p class="nh-general__group-title">{{ t('settings.mediaSearch') }}</p>

      <div class="nh-general__panel">
        <div class="nh-general__row">
          <span class="nh-general__icon">
            <AppIcon name="search" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.pexelsApiKey') }}</p>
            <p class="nh-general__hint">{{ t('settings.mediaSearchHint') }}</p>
            <NPopover trigger="click" placement="bottom-start">
              <template #trigger>
                <NButton text type="primary" size="tiny">
                  {{ t('settings.pexelsHowTo') }}
                </NButton>
              </template>
              <div class="nh-general__help">
                <p>{{ t('settings.pexelsSteps') }}</p>
                <NButton size="small" type="primary" @click="openPexels">
                  {{ t('settings.pexelsOpen') }}
                </NButton>
              </div>
            </NPopover>
          </div>
          <div class="nh-general__search">
            <NInput
              v-model:value="pexelsApiKey"
              type="password"
              show-password-on="click"
              :placeholder="t('settings.pleaseInput')"
            />
            <NButton type="primary" :loading="savingSearch" @click="saveMediaSearch">
              {{ t('settings.save') }}
            </NButton>
          </div>
        </div>
      </div>
    </div>

    <div class="nh-general__group">
      <p class="nh-general__group-title">{{ t('settings.about') }}</p>

      <div class="nh-general__panel">
        <div class="nh-general__row">
          <span class="nh-general__icon">
            <AppIcon name="info" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.version') }}</p>
          </div>
          <span class="nh-general__version">{{ version }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 通用设置：语言、开机自启与版本信息。
 */

import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NInput,
  NPopover,
  NSelect,
  NSwitch,
  useMessage,
  type SelectOption
} from 'naive-ui';
import type { AppLanguage, NotificationBadgeStyle } from '@shared/ipc/contracts';
import { locale, setLocale, t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import {
  getAutoLaunch,
  getNotificationBadge,
  getSearchSettings,
  openExternalLink,
  setSearchSettings,
  setAutoLaunch,
  setLanguage,
  setNotificationBadge
} from '../api/settings.api';

defineProps<{ version: string }>();

const message = useMessage();
const autoLaunch = ref(true);
const badgeStyle = ref<NotificationBadgeStyle>('dot');
const pexelsApiKey = ref('');
const savingSearch = ref(false);
const loading = ref(false);
const languageOptions = computed<SelectOption[]>(() => [
  { label: t('settings.languageZh'), value: 'zh-CN' },
  { label: t('settings.languageEn'), value: 'en-US' }
]);

const badgeOptions = computed<SelectOption[]>(() => [
  { label: t('settings.notificationBadgeDot'), value: 'dot' },
  { label: t('settings.notificationBadgeCount'), value: 'count' }
]);

/**
 * 读取当前开机自启状态。
 */
const load = async (): Promise<void> => {
  const [autoLaunchResult, badgeResult, searchResult] = await Promise.allSettled([
    getAutoLaunch(),
    getNotificationBadge(),
    getSearchSettings()
  ]);
  if (autoLaunchResult.status === 'fulfilled') autoLaunch.value = autoLaunchResult.value;
  if (badgeResult.status === 'fulfilled') badgeStyle.value = badgeResult.value;
  if (searchResult.status === 'fulfilled')
    pexelsApiKey.value = searchResult.value?.pexelsApiKey ?? '';
  if (
    autoLaunchResult.status === 'rejected' ||
    badgeResult.status === 'rejected' ||
    searchResult.status === 'rejected'
  ) {
    message.error(t('settings.loadFailed'));
  }
};

/**
 * 更新开机自启状态并持久化。
 */
const changeBadge = async (value: NotificationBadgeStyle): Promise<void> => {
  const previous = badgeStyle.value;
  badgeStyle.value = value;
  try {
    await setNotificationBadge(value);
    message.success(t('settings.saved'));
  } catch (reason) {
    badgeStyle.value = previous;
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

const changeAutoLaunch = async (value: boolean): Promise<void> => {
  loading.value = true;
  try {
    autoLaunch.value = await setAutoLaunch(value);
    message.success(t('settings.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  } finally {
    loading.value = false;
  }
};

/**
 * 切换界面语言并持久化。
 */
const changeLanguage = async (value: AppLanguage): Promise<void> => {
  const previous = locale.value;
  setLocale(value);
  try {
    await setLanguage(value);
    message.success(t('settings.saved'));
  } catch (reason) {
    setLocale(previous);
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

/**
 * 打开 Pexels API 申请页面。
 */
const openPexels = async (): Promise<void> => {
  try {
    await openExternalLink('https://www.pexels.com/api/');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

/**
 * 保存媒体搜索 API Key。
 */
const saveMediaSearch = async (): Promise<void> => {
  savingSearch.value = true;
  try {
    await setSearchSettings({
      ...(pexelsApiKey.value.trim() ? { pexelsApiKey: pexelsApiKey.value.trim() } : {})
    });
    message.success(t('settings.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  } finally {
    savingSearch.value = false;
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-general {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nh-general__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nh-general__group-title {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-general__panel {
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-general__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.nh-general__row--divided {
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-general__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-general__copy {
  min-width: 0;
  flex: 1;
}

.nh-general__search {
  display: flex;
  width: min(360px, 45vw);
  flex: none;
  gap: 8px;
}

.nh-general__help {
  max-width: 260px;
}

.nh-general__help p {
  margin: 0 0 10px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-general__title,
.nh-general__hint {
  margin: 0;
}

.nh-general__title {
  color: var(--nh-color-text-primary);
  font-size: 14px;
}

.nh-general__hint {
  margin-top: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-general__language {
  width: 140px;
  flex: none;
}

.nh-general__version {
  flex: none;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}
</style>
