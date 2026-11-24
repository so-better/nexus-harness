<template>
  <section class="nh-extension-panel">
    <div class="nh-extension-panel__header">
      <p>{{ t('skills.hint') }}</p>
      <div class="nh-extension-panel__actions">
        <NButton type="primary" secondary :loading="busy" @click="importSkill">
          <template #icon><AppIcon name="upload" :size="14" /></template>
          {{ t('skills.import') }}
        </NButton>
        <NButton secondary :loading="loading" @click="load">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          {{ t('skills.refresh') }}
        </NButton>
        <NButton secondary @click="openFolder">
          <template #icon><AppIcon name="folder" :size="14" /></template>
          {{ t('skills.openDirectory') }}
        </NButton>
      </div>
    </div>
    <NInput
      v-model:value="query"
      class="nh-extension-panel__search"
      size="small"
      clearable
      :placeholder="t('skills.searchPlaceholder')"
    >
      <template #prefix>
        <AppIcon name="search" :size="14" />
      </template>
    </NInput>
    <NEmpty v-if="!skills.length" class="nh-extension-empty" :description="t('skills.empty')">
      <template #icon><AppIcon name="spark" :size="30" /></template>
    </NEmpty>
    <NEmpty
      v-else-if="!filteredSkills.length"
      class="nh-extension-empty"
      :description="t('skills.searchEmpty')"
    >
      <template #icon><AppIcon name="search" :size="30" /></template>
    </NEmpty>
    <div v-else class="nh-extension-list">
      <article v-for="skill in filteredSkills" :key="skill.id" class="nh-extension-item">
        <div class="nh-extension-item__top">
          <div>
            <strong>{{ skill.name }}</strong>
            <span class="nh-extension-item__id">{{ skill.id }} · v{{ skill.version }}</span>
          </div>
          <ExtensionSourceTag
            :source="skill.source"
            :label="skill.source === 'builtin' ? t('skills.builtin') : t('skills.user')"
          />
        </div>
        <p v-if="skill.description" class="nh-extension-item__description">
          {{ skill.description }}
        </p>
        <div v-if="skill.tags.length" class="nh-extension-item__tags">
          <NTag
            v-for="tag in skill.tags"
            :key="tag"
            class="nh-extension-item__tag"
            size="tiny"
            :bordered="false"
          >
            {{ tag }}
          </NTag>
        </div>
        <div v-if="skill.source !== 'builtin'" class="nh-extension-item__actions">
          <NPopconfirm @positive-click="removeSkill(skill.id)">
            <template #trigger>
              <NButton text size="tiny" type="error" :loading="deleting === skill.id">
                <template #icon><AppIcon name="trash" :size="13" /></template>
                {{ t('skills.delete') }}
              </NButton>
            </template>
            {{ t('skills.deleteConfirm') }}
          </NPopconfirm>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 扩展页 Skill 列表：导入包含 SKILL.md 的目录、刷新与删除。
 */

import { computed, onMounted, ref } from 'vue';
import { NButton, NEmpty, NInput, NPopconfirm, NTag, useMessage } from 'naive-ui';
import type { SkillSummary } from '@shared/skills';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import ExtensionSourceTag from './ExtensionSourceTag.vue';
import { deleteSkill, importSkillDirectory, listSkills } from '@/modules/chat/api/skills.api';
import { openDataLocation } from '@/app/data-location.api';

const message = useMessage();
const skills = ref<SkillSummary[]>([]);
const loading = ref(false);
const busy = ref(false);
const deleting = ref<string>();
const query = ref('');

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    skills.value = await listSkills();
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('skills.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const openFolder = async (): Promise<void> => {
  try {
    await openDataLocation('skills');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('extensions.openFailed'));
  }
};

const importSkill = async (): Promise<void> => {
  busy.value = true;
  try {
    const next = await importSkillDirectory();
    if (!next) return;
    skills.value = next;
    message.success(t('skills.imported'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('skills.importFailed'));
  } finally {
    busy.value = false;
  }
};

const removeSkill = async (id: string): Promise<void> => {
  deleting.value = id;
  try {
    skills.value = await deleteSkill(id);
    message.success(t('skills.deleted'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('skills.deleteFailed'));
  } finally {
    deleting.value = undefined;
  }
};

const filteredSkills = computed(() => {
  const value = query.value.trim().toLowerCase();
  if (!value) return skills.value;
  return skills.value.filter((skill) =>
    [skill.name, skill.id, skill.description ?? '', ...skill.tags].some((item) =>
      item.toLowerCase().includes(value)
    )
  );
});

onMounted(load);
</script>

<style scoped lang="less">
.nh-extension-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nh-extension-empty {
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

.nh-extension-empty :deep(.n-empty__icon) {
  opacity: 0.72;
}

.nh-extension-empty :deep(.n-empty__description) {
  margin-top: 8px;
  color: color-mix(in srgb, var(--nh-color-text-secondary) 72%, transparent);
  font-size: 13px;
}

.nh-extension-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.nh-extension-panel__header p {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-extension-panel__actions {
  display: flex;
  flex: none;
  gap: 6px;
}

.nh-extension-panel__search {
  margin-bottom: 2px;
}

.nh-extension-list {
  display: flex;
  max-height: min(520px, 58vh);
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.nh-extension-item {
  padding: 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-color-bg-elevated);
}

.nh-extension-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.nh-extension-item__top strong {
  display: block;
  font-size: 13px;
}

.nh-extension-item__id {
  display: block;
  margin-top: 3px;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-extension-item__description {
  margin: 8px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-extension-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.nh-extension-item__top :deep(.n-tag) {
  --n-height: auto;
  --n-padding: 4px 8px;

  border-radius: 1000px;
  font-size: 12px;
  line-height: 1.5;
  letter-spacing: 0.01em;
}

.nh-extension-item__tags :deep(.n-tag) {
  --n-height: auto;
  --n-padding: 2px 8px;

  border-radius: 6px;
  font-size: 10px;
  line-height: 1.5;
  letter-spacing: 0.01em;
}

.nh-extension-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
