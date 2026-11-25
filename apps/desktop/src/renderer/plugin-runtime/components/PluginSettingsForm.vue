<template>
  <div class="nh-plugin-settings">
    <p class="nh-plugin-settings__title">{{ t('plugins.settings') }}</p>
    <div class="nh-plugin-settings__fields">
      <div v-for="setting in settings" :key="setting.key" class="nh-plugin-settings__field">
        <span class="nh-plugin-settings__label" :title="setting.title ?? setting.key">
          {{ setting.title ?? setting.key }}
        </span>
        <div class="nh-plugin-settings__control">
          <NInput
            v-if="setting.type === 'string'"
            :value="stringValue(setting.key)"
            size="small"
            @update:value="(value) => update(setting.key, value)"
          />
          <NInputNumber
            v-else-if="setting.type === 'number'"
            :value="numberValue(setting.key)"
            size="small"
            :show-button="false"
            @update:value="(value) => update(setting.key, value)"
          />
          <NSwitch
            v-else
            :value="booleanValue(setting.key)"
            size="small"
            @update:value="(value) => update(setting.key, value)"
          />
        </div>
      </div>
    </div>
    <div class="nh-plugin-settings__footer">
      <NButton
        class="nh-plugin-settings__save"
        size="small"
        type="primary"
        secondary
        :disabled="!isDirty"
        :loading="saving"
        @click="save"
      >
        {{ t('plugins.saveSettings') }}
      </NButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 插件设置表单：按 manifest 声明渲染 string / number / boolean 字段。
 */

import { computed, ref, watch } from 'vue';
import { NButton, NInput, NInputNumber, NSwitch, useMessage } from 'naive-ui';
import type { PluginPublic, PluginSettingValue } from '@shared/plugin';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore } from '../runtime.store';

const props = defineProps<{ plugin: PluginPublic }>();
const runtime = usePluginRuntimeStore();
const message = useMessage();
const values = ref<Record<string, PluginSettingValue>>({});
/** 已保存的值，用于判断是否有未保存修改 */
const baseline = ref<Record<string, PluginSettingValue>>({});
const saving = ref(false);
const settings = computed(() => props.plugin.contributes.settings);
const isDirty = computed(() => JSON.stringify(values.value) !== JSON.stringify(baseline.value));

const stringValue = (key: string): string => {
  const value = values.value[key];
  return typeof value === 'string' ? value : '';
};

const numberValue = (key: string): number | null => {
  const value = values.value[key];
  return typeof value === 'number' ? value : null;
};

const booleanValue = (key: string): boolean => values.value[key] === true;

const update = (key: string, value: string | number | boolean | null): void => {
  values.value = { ...values.value, [key]: value };
};

/**
 * 读取当前插件设置；插件重新加载后重新读取，避免显示旧值。
 */
const load = async (): Promise<void> => {
  try {
    const loaded = await runtime.loadSettings(props.plugin.id);
    values.value = { ...loaded };
    baseline.value = { ...loaded };
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('plugins.settingsFailed'));
  }
};

const save = async (): Promise<void> => {
  saving.value = true;
  try {
    await runtime.saveSettings(props.plugin.id, { ...values.value });
    baseline.value = { ...values.value };
    message.success(t('plugins.settingsSaved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('plugins.settingsFailed'));
  } finally {
    saving.value = false;
  }
};

watch(() => [props.plugin.id, props.plugin.version], load, { immediate: true });
</script>

<style scoped lang="less">
.nh-plugin-settings {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-plugin-settings__title {
  margin: 0 0 4px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.nh-plugin-settings__fields {
  display: flex;
  flex-direction: column;
}

.nh-plugin-settings__field {
  display: grid;
  grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
  align-items: center;
  gap: 6px 16px;
  padding: 8px 0;
}

.nh-plugin-settings__field + .nh-plugin-settings__field {
  border-top: 1px solid color-mix(in srgb, var(--nh-border-subtle) 60%, transparent);
}

.nh-plugin-settings__label {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-plugin-settings__control {
  display: flex;
  min-width: 0;
  align-items: center;
}

.nh-plugin-settings__control :deep(.n-input),
.nh-plugin-settings__control :deep(.n-input-number) {
  max-width: 280px;
}

.nh-plugin-settings__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--nh-border-subtle);
}
</style>
