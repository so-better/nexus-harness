<template>
  <section class="nh-media">
    <div class="nh-media__header">
      <div class="nh-media__heading">
        <span class="nh-media__icon"><AppIcon name="key" :size="18" /></span>
        <div>
          <p class="nh-media__title">{{ t('settings.mediaSearch') }}</p>
          <p class="nh-media__hint">{{ t('settings.mediaSearchHint') }}</p>
        </div>
      </div>
      <NTag size="small" :bordered="false" :type="configured ? 'success' : 'default'">
        {{ configured ? t('settings.pexelsConfigured') : t('settings.pexelsNotConfigured') }}
      </NTag>
    </div>

    <div class="nh-media__field">
      <label class="nh-media__label" for="pexels-api-key">
        {{ t('settings.pexelsApiKey') }}
      </label>
      <div class="nh-media__form">
        <NInput
          id="pexels-api-key"
          v-model:value="pexelsApiKey"
          size="large"
          type="password"
          show-password-on="click"
          clearable
          :placeholder="t('settings.pexelsPlaceholder')"
        >
          <template #prefix><AppIcon name="key" :size="15" /></template>
        </NInput>
        <NButton
          type="primary"
          size="large"
          :loading="savingSearch"
          :disabled="!pexelsApiKey.trim() && !savedKey"
          @click="saveMediaSearch"
        >
          {{ t('settings.save') }}
        </NButton>
      </div>
    </div>

    <div class="nh-media__steps">
      <div class="nh-media__step">
        <span class="nh-media__step-index">1</span>
        <p>{{ t('settings.pexelsStep1') }}</p>
      </div>
      <div class="nh-media__step">
        <span class="nh-media__step-index">2</span>
        <p>{{ t('settings.pexelsStep2') }}</p>
      </div>
      <div class="nh-media__step">
        <span class="nh-media__step-index">3</span>
        <p>{{ t('settings.pexelsStep3') }}</p>
      </div>
    </div>

    <div class="nh-media__footer">
      <NButton text type="primary" size="small" @click="openPexels">
        {{ t('settings.pexelsOpen') }}
        <template #icon><AppIcon name="export" :size="14" /></template>
      </NButton>
      <span class="nh-media__local">{{ t('settings.pexelsLocalOnly') }}</span>
    </div>
  </section>

  <section class="nh-media">
    <div class="nh-media__header">
      <div class="nh-media__heading">
        <span class="nh-media__icon"><AppIcon name="globe" :size="18" /></span>
        <div>
          <p class="nh-media__title">{{ t('settings.webSearch') }}</p>
          <p class="nh-media__hint">{{ t('settings.webSearchHint') }}</p>
        </div>
      </div>
      <NTag size="small" :bordered="false" :type="anysearchConfigured ? 'success' : 'default'">
        {{
          anysearchConfigured ? t('settings.anysearchConfigured') : t('settings.anysearchAnonymous')
        }}
      </NTag>
    </div>

    <div class="nh-media__field">
      <label class="nh-media__label" for="anysearch-api-key">
        {{ t('settings.anysearchApiKey') }}
      </label>
      <div class="nh-media__form">
        <NInput
          id="anysearch-api-key"
          v-model:value="anysearchApiKey"
          size="large"
          type="password"
          show-password-on="click"
          clearable
          :placeholder="t('settings.anysearchPlaceholder')"
        >
          <template #prefix><AppIcon name="key" :size="15" /></template>
        </NInput>
        <NButton
          type="primary"
          size="large"
          :loading="savingAnysearch"
          :disabled="!anysearchApiKey.trim() && !savedAnysearchKey"
          @click="saveAnysearch"
        >
          {{ t('settings.save') }}
        </NButton>
      </div>
    </div>

    <div class="nh-media__steps">
      <div class="nh-media__step">
        <span class="nh-media__step-index">1</span>
        <p>{{ t('settings.anysearchStep1') }}</p>
      </div>
      <div class="nh-media__step">
        <span class="nh-media__step-index">2</span>
        <p>{{ t('settings.anysearchStep2') }}</p>
      </div>
      <div class="nh-media__step">
        <span class="nh-media__step-index">3</span>
        <p>{{ t('settings.anysearchStep3') }}</p>
      </div>
    </div>

    <div class="nh-media__footer">
      <NButton text type="primary" size="small" @click="openAnysearch">
        {{ t('settings.anysearchOpen') }}
        <template #icon><AppIcon name="export" :size="14" /></template>
      </NButton>
      <span class="nh-media__local">{{ t('settings.anysearchLocalOnly') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 媒体搜索配置：Pexels API Key 的说明、状态与保存。
 */

import { computed, onMounted, ref } from 'vue';
import { NButton, NInput, NTag, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { getSearchSettings, openExternalLink, setSearchSettings } from '../api/settings.api';

const message = useMessage();
const pexelsApiKey = ref('');
const savedKey = ref('');
const savingSearch = ref(false);
const savingAnysearch = ref(false);
const anysearchApiKey = ref('');
const savedAnysearchKey = ref('');
const configured = computed(() => Boolean(savedKey.value.trim()));
const anysearchConfigured = computed(() => Boolean(savedAnysearchKey.value.trim()));

const load = async (): Promise<void> => {
  try {
    const settings = await getSearchSettings();
    savedKey.value = settings?.pexelsApiKey ?? '';
    pexelsApiKey.value = savedKey.value;
    savedAnysearchKey.value = settings?.anysearchApiKey ?? '';
    anysearchApiKey.value = savedAnysearchKey.value;
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

const openAnysearch = async (): Promise<void> => {
  try {
    await openExternalLink('https://www.anysearch.com/console/api-keys');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

const openPexels = async (): Promise<void> => {
  try {
    await openExternalLink('https://www.pexels.com/api/');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

const saveMediaSearch = async (): Promise<void> => {
  savingSearch.value = true;
  try {
    await setSearchSettings({
      ...(pexelsApiKey.value.trim() ? { pexelsApiKey: pexelsApiKey.value.trim() } : {}),
      ...(savedAnysearchKey.value.trim() ? { anysearchApiKey: savedAnysearchKey.value.trim() } : {})
    });
    savedKey.value = pexelsApiKey.value.trim();
    pexelsApiKey.value = savedKey.value;
    message.success(t('settings.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  } finally {
    savingSearch.value = false;
  }
};

const saveAnysearch = async (): Promise<void> => {
  savingAnysearch.value = true;
  try {
    await setSearchSettings({
      ...(savedKey.value.trim() ? { pexelsApiKey: savedKey.value.trim() } : {}),
      ...(anysearchApiKey.value.trim() ? { anysearchApiKey: anysearchApiKey.value.trim() } : {})
    });
    savedAnysearchKey.value = anysearchApiKey.value.trim();
    anysearchApiKey.value = savedAnysearchKey.value;
    message.success(t('settings.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  } finally {
    savingAnysearch.value = false;
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-media {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-media__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.nh-media__heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
}

.nh-media__icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-accent) 12%, transparent);
  color: var(--nh-color-accent);
}

.nh-media__title,
.nh-media__hint {
  margin: 0;
}

.nh-media__title {
  color: var(--nh-color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.nh-media__hint {
  margin-top: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.nh-media__field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.nh-media__label {
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.nh-media__form {
  display: flex;
  min-width: 0;
  gap: 8px;
}

.nh-media__form .n-input {
  min-width: 0;
  flex: 1;
}

.nh-media__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding-top: 2px;
}

.nh-media__step {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 7px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-media__step p {
  margin: 0;
}

.nh-media__step-index {
  display: grid;
  width: 18px;
  height: 18px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-media__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 2px;
}

.nh-media__local {
  color: var(--nh-color-text-disabled);
  font-size: 11px;
}

@media (width <= 640px) {
  .nh-media__steps {
    grid-template-columns: 1fr;
  }

  .nh-media__form {
    flex-direction: column;
  }
}
</style>
