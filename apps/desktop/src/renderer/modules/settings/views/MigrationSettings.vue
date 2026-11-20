<template>
  <section class="nh-migration">
    <div class="nh-migration__hero">
      <span class="nh-migration__icon">
        <AppIcon name="database" :size="20" />
      </span>
      <div class="nh-migration__copy">
        <p class="nh-migration__title">{{ t('settings.migration') }}</p>
        <p class="nh-migration__hint">{{ t('settings.migrationHint') }}</p>
      </div>
    </div>

    <div class="nh-migration__grid">
      <article class="nh-migration__card">
        <div class="nh-migration__card-head">
          <span class="nh-migration__card-icon">
            <AppIcon name="export" :size="17" />
          </span>
          <div>
            <p class="nh-migration__card-title">{{ t('settings.migrationExport') }}</p>
            <p class="nh-migration__card-hint">{{ t('settings.migrationExportHint') }}</p>
          </div>
        </div>
        <NButton
          class="nh-migration__action"
          secondary
          type="primary"
          :loading="exporting"
          :disabled="migrationBusy || pendingRestart"
          @click="handleExport"
        >
          <template #icon><AppIcon name="export" :size="14" /></template>
          {{ t('settings.migrationExport') }}
        </NButton>
      </article>

      <article class="nh-migration__card">
        <div class="nh-migration__card-head">
          <span class="nh-migration__card-icon">
            <AppIcon name="download" :size="17" />
          </span>
          <div>
            <p class="nh-migration__card-title">{{ t('settings.migrationImport') }}</p>
            <p class="nh-migration__card-hint">{{ t('settings.migrationImportHint') }}</p>
          </div>
        </div>
        <NPopconfirm @positive-click="handleImport">
          <template #trigger>
            <NButton
              class="nh-migration__action"
              secondary
              type="primary"
              :loading="importing"
              :disabled="migrationBusy || pendingRestart"
            >
              <template #icon><AppIcon name="download" :size="14" /></template>
              {{ t('settings.migrationImport') }}
            </NButton>
          </template>
          {{ t('settings.migrationImportConfirm') }}
        </NPopconfirm>
      </article>
    </div>

    <NAlert v-if="pendingRestart" type="warning" :show-icon="false">
      <div class="nh-migration__alert">
        <span>{{ t('settings.migrationRestartHint') }}</span>
        <NButton size="small" type="warning" @click="handleRestart">
          {{ t('settings.migrationRestart') }}
        </NButton>
      </div>
    </NAlert>

    <NAlert v-else-if="props.busy" type="info" :show-icon="false">
      {{ t('settings.migrationBusy') }}
    </NAlert>

    <div v-if="lastPath" class="nh-migration__path">
      <AppIcon name="folder" :size="14" />
      <span>{{ t('settings.migrationPath') }}</span>
      <code>{{ lastPath }}</code>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 数据迁移：导出/导入 userData 备份；导入后需要重启应用完成替换。
 */

import { computed, onMounted, ref } from 'vue';
import { NAlert, NButton, NPopconfirm, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { exportBackup, getBackupStatus, importBackup, relaunchApp } from '../api/settings.api';

const props = defineProps<{ busy: boolean }>();
const message = useMessage();
const exporting = ref(false);
const importing = ref(false);
const lastPath = ref('');
const pendingRestart = ref(false);
const migrationBusy = computed(
  () => props.busy || exporting.value || importing.value
);

onMounted(async () => {
  try {
    pendingRestart.value = (await getBackupStatus()).pendingRestore;
  } catch {
    // 状态读取失败不阻塞导入导出入口
  }
});

const handleExport = async (): Promise<void> => {
  exporting.value = true;
  try {
    const result = await exportBackup();
    if (!result) return;
    lastPath.value = result.path;
    message.success(t('settings.migrationExportDone'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.migrationFailed'));
  } finally {
    exporting.value = false;
  }
};

const handleImport = async (): Promise<void> => {
  importing.value = true;
  try {
    const result = await importBackup();
    if (!result) return;
    pendingRestart.value = true;
    message.success(t('settings.migrationImportDone'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.migrationFailed'));
  } finally {
    importing.value = false;
  }
};

const handleRestart = async (): Promise<void> => {
  try {
    await relaunchApp();
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('settings.migrationFailed'));
  }
};
</script>

<style scoped lang="less">
.nh-migration {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nh-migration__hero {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
}

.nh-migration__icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: none;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
  color: var(--nh-color-accent);
}

.nh-migration__copy {
  min-width: 0;
}

.nh-migration__title,
.nh-migration__hint,
.nh-migration__card-title,
.nh-migration__card-hint {
  margin: 0;
}

.nh-migration__title {
  color: var(--nh-color-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.nh-migration__hint {
  margin-top: 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.nh-migration__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.nh-migration__card {
  display: flex;
  min-width: 0;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 40%, transparent);
}

.nh-migration__card-head {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 9px;
}

.nh-migration__action {
  flex: none;
}

.nh-migration__card-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-migration__card-title {
  color: var(--nh-color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.nh-migration__card-hint {
  margin-top: 3px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-migration__alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.nh-migration__path {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-migration__path code {
  min-width: 0;
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (width <= 640px) {
  .nh-migration__grid {
    grid-template-columns: 1fr;
  }

  .nh-migration__card {
    align-items: flex-start;
    flex-direction: column;
  }

  .nh-migration__action {
    align-self: flex-start;
  }
}
</style>
