<template>
  <section class="nh-extension-panel">
    <div class="nh-extension-panel__header">
      <p>{{ t('skills.hint') }}</p>
      <div class="nh-extension-panel__actions">
        <NButton type="primary" secondary :loading="busy" @click="importSkill">
          {{ t('skills.import') }}
        </NButton>
        <NButton secondary :loading="loading" @click="load">
          {{ t('skills.refresh') }}
        </NButton>
      </div>
    </div>
    <NEmpty v-if="!skills.length" class="nh-extension-empty" :description="t('skills.empty')">
      <template #icon><AppIcon name="spark" :size="30" /></template>
    </NEmpty>
    <div v-else class="nh-extension-list">
      <article v-for="skill in skills" :key="skill.id" class="nh-extension-item">
        <div class="nh-extension-item__top">
          <div>
            <strong>{{ skill.name }}</strong>
            <span class="nh-extension-item__id">{{ skill.id }} · v{{ skill.version }}</span>
          </div>
          <NTag
            size="small"
            :bordered="false"
            :type="skill.source === 'builtin' ? 'warning' : 'primary'"
          >
            {{ skill.source === 'builtin' ? t('skills.builtin') : t('skills.user') }}
          </NTag>
        </div>
        <p v-if="skill.description" class="nh-extension-item__description">
          {{ skill.description }}
        </p>
        <div v-if="skill.tags.length" class="nh-extension-item__tags">
          <NTag v-for="tag in skill.tags" :key="tag" size="tiny" :bordered="false">{{ tag }}</NTag>
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

import { onMounted, ref } from 'vue';
import { NButton, NEmpty, NPopconfirm, NTag, useMessage } from 'naive-ui';
import type { SkillSummary } from '@shared/skills';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { deleteSkill, importSkillDirectory, listSkills } from '@/modules/chat/api/skills.api';

const message = useMessage();
const skills = ref<SkillSummary[]>([]);
const loading = ref(false);
const busy = ref(false);
const deleting = ref<string>();

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
  min-height: 220px;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--nh-border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 55%, transparent);
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
  gap: 4px;
  margin-top: 8px;
}

.nh-extension-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
