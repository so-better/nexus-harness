<template>
  <article
    class="nh-knowledge-source"
    :class="{ 'nh-knowledge-source--error': source.status === 'error' }"
  >
    <span class="nh-knowledge-source__glyph">
      <AppIcon name="file" :size="16" />
    </span>
    <div class="nh-knowledge-source__main">
      <div class="nh-knowledge-source__title-row">
        <strong :title="source.name">{{ source.name }}</strong>
        <span
          class="nh-knowledge-source__status"
          :class="`nh-knowledge-source__status--${source.status}`"
        >
          <span class="nh-knowledge-source__status-dot" />
          {{ source.status === 'ready' ? t('knowledge.statusReady') : t('knowledge.statusError') }}
        </span>
      </div>
      <p v-if="source.originPath" class="nh-knowledge-source__path" :title="source.originPath">
        <AppIcon name="folder" :size="11" />
        <span>{{ source.originPath }}</span>
      </p>
      <div class="nh-knowledge-source__meta">
        <span>{{ t('knowledge.chunkCount', { count: source.chunkCount }) }}</span>
        <span class="nh-knowledge-source__dot">·</span>
        <span>{{ formatBytes(source.bytes) }}</span>
      </div>
      <p v-if="source.error" class="nh-knowledge-source__error">{{ source.error }}</p>
    </div>
    <div class="nh-knowledge-source__actions">
      <NButton text size="tiny" :loading="busy" @click="emit('reindex', source)">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        {{ t('knowledge.reindex') }}
      </NButton>
      <NButton
        v-if="source.originPath"
        text
        size="tiny"
        :disabled="busy"
        @click="emit('open', source)"
      >
        <template #icon><AppIcon name="folder" :size="13" /></template>
        {{ t('knowledge.openSource') }}
      </NButton>
      <NPopconfirm @positive-click="emit('remove', source)">
        <template #trigger>
          <NButton text size="tiny" type="error" :disabled="busy">
            <template #icon><AppIcon name="trash" :size="13" /></template>
            {{ t('knowledge.delete') }}
          </NButton>
        </template>
        {{ t('knowledge.deleteConfirm') }}
      </NPopconfirm>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 知识库来源行：文件图标、状态、路径、索引统计与操作。
 */
import { NButton, NPopconfirm } from 'naive-ui';
import type { KnowledgeSource } from '@shared/knowledge';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

defineProps<{ source: KnowledgeSource; busy: boolean }>();
const emit = defineEmits<{
  reindex: [source: KnowledgeSource];
  remove: [source: KnowledgeSource];
  open: [source: KnowledgeSource];
}>();

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<style scoped lang="less">
.nh-knowledge-source {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-color-bg-elevated);
  transition:
    border-color var(--nh-duration-fast) var(--nh-ease-standard),
    background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-knowledge-source:hover {
  border-color: color-mix(in srgb, var(--nh-color-accent) 20%, var(--nh-border-subtle));
  background: color-mix(in srgb, var(--nh-color-accent) 3%, var(--nh-color-bg-elevated));
}

.nh-knowledge-source--error {
  border-color: color-mix(in srgb, var(--nh-color-danger) 28%, var(--nh-border-subtle));
}

.nh-knowledge-source__glyph {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-color-accent) 9%, transparent);
  color: var(--nh-color-accent);
}

.nh-knowledge-source__main {
  min-width: 0;
}

.nh-knowledge-source__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-knowledge-source__title-row strong {
  overflow: hidden;
  min-width: 0;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-knowledge-source__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.5;
}

.nh-knowledge-source__status--ready {
  background: color-mix(in srgb, var(--nh-color-success) 10%, transparent);
  color: var(--nh-color-success);
}

.nh-knowledge-source__status--error {
  background: color-mix(in srgb, var(--nh-color-danger) 10%, transparent);
  color: var(--nh-color-danger);
}

.nh-knowledge-source__status-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentcolor;
}

.nh-knowledge-source__path {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  margin: 5px 0 0;
  color: var(--nh-color-text-secondary);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-knowledge-source__path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-knowledge-source__meta {
  margin-top: 5px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-knowledge-source__dot {
  margin: 0 4px;
  color: var(--nh-color-text-disabled);
}

.nh-knowledge-source__error {
  margin: 5px 0 0;
  color: var(--nh-color-danger);
  font-size: 11px;
}

.nh-knowledge-source__actions {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 300px;
}
</style>
