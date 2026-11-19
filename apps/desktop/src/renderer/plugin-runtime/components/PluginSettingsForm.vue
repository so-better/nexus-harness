<template>
  <div class="nh-plugin-settings">
    <p class="nh-plugin-settings__title">{{ t('plugins.settings') }}</p>
    <div class="nh-plugin-settings__fields">
      <label v-for="setting in settings" :key="setting.key" class="nh-plugin-settings__field">
        <span class="nh-plugin-settings__label">{{ setting.title ?? setting.key }}</span>
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
          @update:value="(value) => update(setting.key, value)"
        />
        <NSwitch
          v-else
          :value="booleanValue(setting.key)"
          size="small"
          @update:value="(value) => update(setting.key, value)"
        />
      </label>
    </div>
    <div class="nh-plugin-settings__actions">
      <NButton size="small" secondary :loading="saving" @click="save">
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
const saving = ref(false);
const settings = computed(() => props.plugin.contributes.settings);

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
    values.value = await runtime.loadSettings(props.plugin.id);
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('plugins.settingsFailed'));
  }
};

const save = async (): Promise<void> => {
  saving.value = true;
  try {
    await runtime.saveSettings(props.plugin.id, { ...values.value });
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
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-plugin-settings__title {
  margin: 0 0 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-plugin-settings__fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nh-plugin-settings__field {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.nh-plugin-settings__label {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-plugin-settings__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
