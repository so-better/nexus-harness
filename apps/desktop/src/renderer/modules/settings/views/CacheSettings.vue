<template>
  <section class="nh-cache">
    <p class="nh-cache__hint">{{ t('settings.cacheHint') }}</p>

    <div class="nh-cache__list">
      <div class="nh-cache__row">
        <div>
          <p class="nh-cache__title">{{ t('settings.cacheFiles') }}</p>
          <p class="nh-cache__size">{{ formatBytes(info.filesBytes) }}</p>
        </div>
        <NPopconfirm @positive-click="clear('files')">
          <template #trigger>
            <NButton size="small" :loading="clearing === 'files'" :disabled="isBusy">
              {{ t('settings.clear') }}
            </NButton>
          </template>
          {{ t('settings.clearConfirm') }}
        </NPopconfirm>
      </div>

      <div class="nh-cache__row">
        <div>
          <p class="nh-cache__title">{{ t('settings.cacheArtifacts') }}</p>
          <p class="nh-cache__size">{{ formatBytes(info.artifactsBytes) }}</p>
        </div>
        <NPopconfirm @positive-click="clear('artifacts')">
          <template #trigger>
            <NButton size="small" :loading="clearing === 'artifacts'" :disabled="isBusy">
              {{ t('settings.clear') }}
            </NButton>
          </template>
          {{ t('settings.clearConfirm') }}
        </NPopconfirm>
      </div>

      <div class="nh-cache__row">
        <div>
          <p class="nh-cache__title">{{ t('settings.cacheLogs') }}</p>
          <p class="nh-cache__size">{{ formatBytes(info.logsBytes) }}</p>
        </div>
        <NPopconfirm @positive-click="clear('logs')">
          <template #trigger>
            <NButton size="small" :loading="clearing === 'logs'" :disabled="isBusy">
              {{ t('settings.clear') }}
            </NButton>
          </template>
          {{ t('settings.clearConfirm') }}
        </NPopconfirm>
      </div>
    </div>

    <NDivider />

    <div class="nh-cache__row">
      <div>
        <p class="nh-cache__title">{{ t('settings.cacheTotal') }}</p>
        <p class="nh-cache__size">{{ formatBytes(info.totalBytes) }}</p>
      </div>
      <NPopconfirm @positive-click="clear('all')">
        <template #trigger>
          <NButton
            size="small"
            type="error"
            secondary
            :loading="clearing === 'all'"
            :disabled="isBusy"
          >
            {{ t('settings.clearAll') }}
          </NButton>
        </template>
        {{ t('settings.clearAll') }}?
      </NPopconfirm>
    </div>

    <NAlert v-if="busy" type="info" :show-icon="false">{{ t('settings.cacheBusy') }}</NAlert>
    <NAlert v-if="info.failed.length" type="warning" :show-icon="false">
      {{ t('settings.cachePartial') }}
    </NAlert>
    <NAlert v-if="message" type="success" :show-icon="false">{{ message }}</NAlert>
    <NAlert v-if="error" type="error" :show-icon="false">{{ error }}</NAlert>
  </section>
</template>

<script setup lang="ts">
/**
 * 缓存设置：统计并清理 AI 文件、工具产物与日志。
 */

import { computed, onMounted, reactive, ref } from 'vue';
import { NAlert, NButton, NDivider, NPopconfirm } from 'naive-ui';
import type { CacheInfo, CacheTarget } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { clearCache, getCacheInfo } from '../api/settings.api';

const props = defineProps<{ busy: boolean }>();

const info = reactive<CacheInfo>({
  filesBytes: 0,
  artifactsBytes: 0,
  logsBytes: 0,
  totalBytes: 0,
  failed: []
});
const clearing = ref<CacheTarget | undefined>();
const message = ref<string>();
const error = ref<string>();
const isBusy = computed(() => props.busy || Boolean(clearing.value));

/**
 * 把字节数格式化为便于阅读的大小。
 */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/**
 * 读取缓存占用。
 */
const load = async (): Promise<void> => {
  try {
    Object.assign(info, await getCacheInfo());
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('settings.loadFailed');
  }
};

/**
 * 清理指定缓存并刷新统计。
 */
const clear = async (target: CacheTarget): Promise<void> => {
  if (isBusy.value) return;
  clearing.value = target;
  message.value = undefined;
  error.value = undefined;
  try {
    Object.assign(info, await clearCache(target));
    message.value = t('settings.cleared');
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : t('settings.loadFailed');
  } finally {
    clearing.value = undefined;
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-cache {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nh-cache__hint {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-cache__list {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--nh-color-border);
  border-radius: 8px;
}

.nh-cache__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
}

.nh-cache__list .nh-cache__row + .nh-cache__row {
  border-top: 1px solid var(--nh-color-border);
}

.nh-cache__title,
.nh-cache__size {
  margin: 0;
}

.nh-cache__title {
  font-size: 14px;
}

.nh-cache__size {
  margin-top: 2px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}
</style>
