<template>
  <article class="nh-plugin-card">
    <div class="nh-plugin-card__identity">
      <div>
        <strong>{{ plugin.name }}</strong>
        <span class="nh-plugin-card__id">{{ plugin.id }} · {{ plugin.version }}</span>
      </div>
      <div class="nh-plugin-card__tags">
        <NTag v-if="plugin.hasMain" size="small" type="warning" :bordered="false">
          {{ t('plugins.mainCode') }}
        </NTag>
        <NTag
          size="small"
          :bordered="false"
          :type="plugin.source === 'builtin' ? 'success' : 'primary'"
        >
          {{ plugin.source === 'builtin' ? t('plugins.builtin') : t('plugins.user') }}
        </NTag>
      </div>
    </div>
    <p v-if="plugin.description" class="nh-plugin-card__description">{{ plugin.description }}</p>
    <div class="nh-plugin-card__permissions">
      <NTag
        v-for="permission in plugin.permissions"
        :key="permission"
        size="tiny"
        :bordered="false"
      >
        {{ permission }}
      </NTag>
    </div>
    <p v-if="plugin.error" class="nh-plugin-card__error">{{ plugin.error }}</p>
    <PluginSettingsForm v-if="plugin.contributes.settings.length" :plugin="plugin" />
    <div class="nh-plugin-card__actions">
      <NPopconfirm v-if="!plugin.enabled" @positive-click="emit('toggle', plugin.id, true)">
        <template #trigger>
          <NSwitch :value="false" :loading="busy" />
        </template>
        {{ t('plugins.enableConfirm') }}
      </NPopconfirm>
      <NSwitch
        v-else
        :value="true"
        :loading="busy"
        @update:value="(value) => emit('toggle', plugin.id, value)"
      />
      <NPopconfirm v-if="plugin.source === 'user'" @positive-click="emit('remove', plugin.id)">
        <template #trigger>
          <NButton text size="tiny" type="error" :loading="busy">
            <template #icon><AppIcon name="trash" :size="13" /></template>
            {{ t('plugins.delete') }}
          </NButton>
        </template>
        {{ t('plugins.uninstallConfirm') }}
      </NPopconfirm>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 插件卡片：权限、错误、设置、启停与卸载操作。
 */

import { NButton, NPopconfirm, NSwitch, NTag } from 'naive-ui';
import type { PluginPublic } from '@shared/plugin';
import { t } from '@/app/i18n';
import PluginSettingsForm from './PluginSettingsForm.vue';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ plugin: PluginPublic; busy: boolean }>();
const emit = defineEmits<{
  toggle: [id: string, enabled: boolean];
  remove: [id: string];
}>();
</script>

<style scoped lang="less">
.nh-plugin-card {
  padding: 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-color-bg-elevated);
}

.nh-plugin-card__identity {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.nh-plugin-card__identity strong {
  display: block;
  color: var(--nh-color-text-primary);
  font-size: 13px;
}

.nh-plugin-card__id {
  display: block;
  margin-top: 3px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-plugin-card__tags {
  display: flex;
  flex: none;
  gap: 6px;
}

.nh-plugin-card__description {
  margin: 8px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-plugin-card__permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.nh-plugin-card__error {
  margin: 8px 0 0;
  color: var(--nh-color-danger);
  font-size: 11px;
}

.nh-plugin-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
