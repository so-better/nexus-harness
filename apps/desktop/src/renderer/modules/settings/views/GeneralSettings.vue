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
            :menu-props="selectMenuProps"
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
            :menu-props="selectMenuProps"
            :value="badgeStyle"
            :options="badgeOptions"
            :placeholder="t('settings.pleaseSelect')"
            @update:value="changeBadge"
          />
        </div>

        <div class="nh-general__row nh-general__row--divided">
          <span class="nh-general__icon">
            <AppIcon name="refresh" :size="16" />
          </span>
          <div class="nh-general__copy">
            <p class="nh-general__title">{{ t('settings.maxSteps') }}</p>
            <p class="nh-general__hint">{{ t('settings.maxStepsHint') }}</p>
          </div>
          <NInputNumber
            class="nh-general__number"
            :value="maxSteps"
            :min="1"
            :max="50"
            :step="1"
            :loading="savingSteps"
            @update:value="updateMaxSteps"
            @blur="saveMaxSteps()"
            @keydown.enter="saveMaxSteps()"
          />
        </div>
      </div>
    </div>

    <MediaSearchSettings />

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

import { selectMenuProps } from '@/app/menu-props';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NInputNumber, NSelect, NSwitch, useMessage, type SelectOption } from 'naive-ui';
import {
  AGENT_MAX_STEPS_DEFAULT,
  type AppLanguage,
  type NotificationBadgeStyle
} from '@shared/ipc/contracts';
import { locale, setLocale, t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import MediaSearchSettings from './MediaSearchSettings.vue';
import {
  getAgentSettings,
  getAutoLaunch,
  getNotificationBadge,
  onGeneralSettingsChanged,
  setAgentSettings,
  setAutoLaunch,
  setLanguage,
  setNotificationBadge
} from '../api/settings.api';

defineProps<{ version: string }>();

const message = useMessage();
const autoLaunch = ref(true);
const badgeStyle = ref<NotificationBadgeStyle>('dot');
const loading = ref(false);
const maxSteps = ref(AGENT_MAX_STEPS_DEFAULT);
const savedMaxSteps = ref(AGENT_MAX_STEPS_DEFAULT);
const savingSteps = ref(false);
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
  const [autoLaunchResult, badgeResult, agentResult] = await Promise.allSettled([
    getAutoLaunch(),
    getNotificationBadge(),
    getAgentSettings()
  ]);
  if (autoLaunchResult.status === 'fulfilled') autoLaunch.value = autoLaunchResult.value;
  if (badgeResult.status === 'fulfilled') badgeStyle.value = badgeResult.value;
  if (agentResult.status === 'fulfilled') {
    maxSteps.value = agentResult.value.maxSteps;
    savedMaxSteps.value = agentResult.value.maxSteps;
  }
  if (
    autoLaunchResult.status === 'rejected' ||
    badgeResult.status === 'rejected' ||
    agentResult.status === 'rejected'
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

const updateMaxSteps = (value: number | null): void => {
  if (value !== null) maxSteps.value = value;
};

/**
 * 输入过程中只更新本地值，失焦或回车时再落盘，避免每输入一位就保存一次。
 */
const saveMaxSteps = async (showError = true): Promise<void> => {
  if (savingSteps.value || maxSteps.value === savedMaxSteps.value) return;
  const previous = savedMaxSteps.value;
  savingSteps.value = true;
  try {
    const saved = await setAgentSettings({ maxSteps: maxSteps.value });
    maxSteps.value = saved.maxSteps;
    savedMaxSteps.value = saved.maxSteps;
  } catch (reason) {
    maxSteps.value = previous;
    if (showError)
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  } finally {
    savingSteps.value = false;
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

let unsubscribeSettings: (() => void) | undefined;

onMounted(async () => {
  await load();
  unsubscribeSettings = onGeneralSettingsChanged((state) => {
    autoLaunch.value = state.autoLaunch;
    badgeStyle.value = state.notificationBadge;
    setLocale(state.language);
  });
});

onBeforeUnmount(() => {
  unsubscribeSettings?.();
  // 通过 Esc 关闭弹窗时输入框不会触发 blur，卸载前补一次静默保存
  saveMaxSteps(false).catch((error: unknown) => {
    console.error('保存最大步骤失败', error);
  });
});
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

.nh-general__number {
  width: 140px;
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
