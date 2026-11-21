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
        <NEmpty v-if="!runtime.plugins.length" :description="t('plugins.empty')" />
        <div v-else class="nh-extensions__list">
          <PluginCard
            v-for="plugin in runtime.plugins"
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
import { NButton, NEmpty, NModal, NTabPane, NTabs, useMessage } from 'naive-ui';
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
