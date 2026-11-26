<template>
  <section class="nh-cache">
    <p class="nh-cache__hint">{{ t('settings.cacheHint') }}</p>

    <div class="nh-cache__summary">
      <span class="nh-cache__summary-icon">
        <AppIcon name="database" :size="20" />
      </span>
      <div class="nh-cache__summary-copy">
        <p class="nh-cache__summary-title">{{ t('settings.cacheTotal') }}</p>
        <p class="nh-cache__summary-size">{{ formatBytes(info.totalBytes) }}</p>
      </div>
      <NPopconfirm @positive-click="clear('all')">
        <template #trigger>
          <NButton size="small" type="error" :loading="clearing === 'all'" :disabled="isBusy">
            <template #icon>
              <AppIcon name="trash" :size="14" />
            </template>
            {{ t('settings.clearAll') }}
          </NButton>
        </template>
        {{ t('settings.clearAll') }}?
      </NPopconfirm>
    </div>

    <div class="nh-cache__group">
      <p class="nh-cache__group-title">{{ t('settings.cacheContents') }}</p>

      <div class="nh-cache__panel">
        <div v-for="item in items" :key="item.target" class="nh-cache__row">
          <span class="nh-cache__icon">
            <AppIcon :name="item.icon" :size="16" />
          </span>
          <div class="nh-cache__copy">
            <p class="nh-cache__title">{{ item.label }}</p>
            <p class="nh-cache__size">{{ formatBytes(item.bytes) }}</p>
          </div>
          <NPopconfirm @positive-click="clear(item.target)">
            <template #trigger>
              <NButton size="small" tertiary :loading="clearing === item.target" :disabled="isBusy">
                <template #icon>
                  <AppIcon name="trash" :size="14" />
                </template>
                {{ t('settings.clear') }}
              </NButton>
            </template>
            {{ t('settings.clearConfirm') }}
          </NPopconfirm>
        </div>
      </div>
    </div>

    <NAlert v-if="busy" type="info" :show-icon="false">{{ t('settings.cacheBusy') }}</NAlert>
  </section>
</template>

<script setup lang="ts">
/**
 * 缓存设置：统计并清理 AI 文件、工具产物、日志与 MCP 运行缓存。
 */

import { computed, onMounted, reactive, ref } from 'vue';
import { NAlert, NButton, NPopconfirm, useMessage } from 'naive-ui';
import type { CacheInfo, CacheTarget } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { clearCache, getCacheInfo } from '../api/settings.api';

const props = defineProps<{ busy: boolean }>();

const info = reactive<CacheInfo>({
  filesBytes: 0,
  artifactsBytes: 0,
  logsBytes: 0,
  mcpBytes: 0,
  totalBytes: 0,
  failed: []
});
const message = useMessage();
const clearing = ref<CacheTarget | undefined>();
const isBusy = computed(() => props.busy || Boolean(clearing.value));

const items = computed<
  Array<{
    target: CacheTarget;
    label: string;
    bytes: number;
    icon: 'file' | 'spark' | 'terminal' | 'plug';
  }>
>(() => [
  {
    target: 'files',
    label: t('settings.cacheFiles'),
    bytes: info.filesBytes,
    icon: 'file'
  },
  {
    target: 'artifacts',
    label: t('settings.cacheArtifacts'),
    bytes: info.artifactsBytes,
    icon: 'spark'
  },
  {
    target: 'logs',
    label: t('settings.cacheLogs'),
    bytes: info.logsBytes,
    icon: 'terminal'
  },
  {
    target: 'mcp',
    label: t('settings.cacheMcp'),
    bytes: info.mcpBytes,
    icon: 'plug'
  }
]);

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
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
  }
};

/**
 * 清理指定缓存并刷新统计。
 */
const clear = async (target: CacheTarget): Promise<void> => {
  if (isBusy.value) return;
  clearing.value = target;
  try {
    Object.assign(info, await clearCache(target));
    if (info.failed.length > 0) message.warning(t('settings.cachePartial'));
    else message.success(t('settings.cleared'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
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
  gap: 20px;
}

.nh-cache__hint {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-cache__summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-cache__summary-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

.nh-cache__summary-copy {
  min-width: 0;
  flex: 1;
}

.nh-cache__summary-title,
.nh-cache__summary-size {
  margin: 0;
}

.nh-cache__summary-title {
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-cache__summary-size {
  margin-top: 2px;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 24px;
  font-weight: 600;
}

.nh-cache__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nh-cache__group-title {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-cache__panel {
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-cache__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.nh-cache__row + .nh-cache__row {
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-cache__icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-surface-hover);
  color: var(--nh-color-text-secondary);
}

.nh-cache__copy {
  min-width: 0;
  flex: 1;
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
