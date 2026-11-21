<template>
  <NModal
    :show="show"
    preset="card"
    class="nh-extensions"
    style="width: min(760px, calc(100vw - 48px))"
    :title="t('plugins.title')"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <NTabs default-value="plugins" type="line" animated>
      <NTabPane name="plugins" :tab="t('plugins.tab')">
        <div class="nh-extensions__header">
          <p>{{ t('plugins.hint') }}</p>
          <div class="nh-extensions__header-actions">
            <NButton type="primary" secondary :loading="importing" @click="importPlugin">
              {{ t('plugins.import') }}
            </NButton>
            <NButton secondary :loading="runtime.loading" @click="runtime.reload()">
              {{ t('plugins.reload') }}
            </NButton>
          </div>
        </div>
        <NInput
          v-model:value="pluginQuery"
          class="nh-extensions__search"
          size="small"
          clearable
          :placeholder="t('plugins.searchPlaceholder')"
        >
          <template #prefix>
            <AppIcon name="search" :size="14" />
          </template>
        </NInput>
        <NEmpty
          v-if="!runtime.plugins.length"
          class="nh-extensions__empty"
          :description="t('plugins.empty')"
        >
          <template #icon><AppIcon name="plug" :size="34" /></template>
        </NEmpty>
        <NEmpty
          v-else-if="!filteredPlugins.length"
          class="nh-extensions__empty"
          :description="t('plugins.searchEmpty')"
        >
          <template #icon><AppIcon name="search" :size="34" /></template>
        </NEmpty>
        <div v-else class="nh-extensions__list">
          <PluginCard
            v-for="plugin in filteredPlugins"
            :key="plugin.id"
            :plugin="plugin"
            :busy="busyId === plugin.id"
            @toggle="toggle"
            @remove="remove"
          />
        </div>

        <PluginExtras :commands="commandList" />
      </NTabPane>
      <NTabPane name="skills" :tab="t('skills.tab')">
        <ExtensionsSkillsPanel />
      </NTabPane>
      <NTabPane name="mcp" :tab="t('mcp.tab')">
        <ExtensionsMcpPanel />
      </NTabPane>
    </NTabs>
  </NModal>
</template>

<script setup lang="ts">
/**
 * 扩展管理弹窗：插件列表、权限、错误、启停与重载。
 */

import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NEmpty, NInput, NModal, NTabPane, NTabs, useMessage } from 'naive-ui';
import AppIcon from '@/components/AppIcon.vue';
import { t } from '@/app/i18n';
import { usePluginRuntimeStore, type PluginCommand } from '../runtime.store';
import PluginCard from './PluginCard.vue';
import PluginExtras from './PluginExtras.vue';
import ExtensionsSkillsPanel from './ExtensionsSkillsPanel.vue';
import ExtensionsMcpPanel from './ExtensionsMcpPanel.vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [show: boolean] }>();
const runtime = usePluginRuntimeStore();
const message = useMessage();
const busyId = ref<string>();
const importing = ref(false);
const pluginQuery = ref('');

onMounted(() => {
  runtime.activateForExtensions().catch(() => undefined);
});

watch(
  () => props.show,
  (show) => {
    if (show) runtime.activateForExtensions().catch(() => undefined);
  }
);
const commandList = computed<PluginCommand[]>(() => [...runtime.commands.values()]);
const filteredPlugins = computed(() => {
  const query = pluginQuery.value.trim().toLowerCase();
  if (!query) return runtime.plugins;
  return runtime.plugins.filter((plugin) =>
    [plugin.name, plugin.id, plugin.description ?? ''].some((value) =>
      value.toLowerCase().includes(query)
    )
  );
});

const importPlugin = async (): Promise<void> => {
  importing.value = true;
  try {
    const imported = await runtime.importFromDirectory();
    if (!imported) return;
    if (runtime.error) {
      message.error(runtime.error);
    } else {
      message.success(t('plugins.imported'));
    }
  } finally {
    importing.value = false;
  }
};

const toggle = async (id: string, enabled: boolean): Promise<void> => {
  busyId.value = id;
  try {
    await runtime.setEnabled(id, enabled);
  } finally {
    busyId.value = undefined;
  }
};

/**
 * 卸载用户插件；内置插件由应用管理，不显示该操作。
 */
const remove = async (id: string): Promise<void> => {
  busyId.value = id;
  try {
    await runtime.uninstall(id);
    message.success(t('plugins.uninstalled'));
  } catch {
    message.error(t('plugins.uninstallFailed'));
  } finally {
    busyId.value = undefined;
  }
};
</script>

<style scoped lang="less">
.nh-extensions {
  width: min(760px, calc(100vw - 48px));
}

.nh-extensions__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.nh-extensions__search {
  margin-bottom: 10px;
}

.nh-extensions__empty {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  padding: 32px;
  border: 1px dashed var(--nh-border-subtle);
  border-radius: 14px;
  background:
    radial-gradient(
      ellipse at 50% 32%,
      color-mix(in srgb, var(--nh-color-accent) 7%, transparent),
      transparent 58%
    ),
    color-mix(in srgb, var(--nh-color-bg-elevated) 52%, transparent);
}

.nh-extensions__empty :deep(.n-empty__icon) {
  opacity: 0.72;
}

.nh-extensions__empty :deep(.n-empty__description) {
  margin-top: 8px;
  color: color-mix(in srgb, var(--nh-color-text-secondary) 72%, transparent);
  font-size: 13px;
}

.nh-extensions__header-actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.nh-extensions__header p {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-extensions__list {
  display: flex;
  max-height: min(560px, 60vh);
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.nh-extensions__extras {
  margin-top: 16px;
}

.nh-extensions__extras h4 {
  margin: 0 0 8px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-extensions__command-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.nh-extensions__shortcut {
  margin-left: 4px;
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}
</style>
