<template>
  <section class="nh-extension-panel">
    <div class="nh-extension-panel__header">
      <p>{{ t('mcp.hint') }}</p>
      <div class="nh-extension-panel__actions">
        <NButton type="primary" :loading="saving" @click="save">{{ t('mcp.save') }}</NButton>
        <NButton type="primary" secondary :loading="testing" @click="test">
          {{ t('mcp.test') }}
        </NButton>
        <NButton secondary :loading="loading" @click="load">{{ t('mcp.refresh') }}</NButton>
      </div>
    </div>
    <MonacoEditor
      v-model="jsonText"
      language="json"
      height="min(480px, 52vh)"
      class="nh-mcp-editor"
    />
    <div v-if="testResults.length" class="nh-mcp-results">
      <div v-for="result in testResults" :key="result.id" class="nh-mcp-result">
        <NTag size="tiny" :bordered="false" :type="result.ok ? 'success' : 'error'">
          {{ result.ok ? t('mcp.testOk') : t('mcp.testError') }}
        </NTag>
        <span class="nh-mcp-result__id">{{ result.id }}</span>
        <span v-if="result.ok" class="nh-mcp-result__detail">
          {{ result.tools }} tools · {{ result.resources }} resources · {{ result.prompts }} prompts
        </span>
        <span v-else class="nh-mcp-result__detail">{{ result.error }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 扩展页 MCP 编辑：直接维护单个标准 mcp.json。
 */

import { defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { NButton, NTag, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import { loadMcpConfig, saveMcpConfig, testMcpConfig } from '../api/mcp.api';
import type { McpTestServerResult } from '@shared/mcp';

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'));

const message = useMessage();
const jsonText = ref('');
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResults = ref<McpTestServerResult[]>([]);

watch(jsonText, () => {
  testResults.value = [];
});

const template = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}`;

const load = async (): Promise<void> => {
  loading.value = true;
  try {
    const text = await loadMcpConfig();
    jsonText.value = text.trim() ? text : template;
    if (text.trim()) {
      try {
        JSON.parse(text);
      } catch {
        message.error(t('mcp.invalidJson'));
      }
    }
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('mcp.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const test = async (): Promise<void> => {
  testing.value = true;
  try {
    const result = await testMcpConfig(jsonText.value);
    testResults.value = result.results;
  } catch (reason) {
    testResults.value = [];
    message.error(reason instanceof Error ? reason.message : t('mcp.testFailed'));
  } finally {
    testing.value = false;
  }
};

const save = async (): Promise<void> => {
  saving.value = true;
  try {
    await saveMcpConfig(jsonText.value);
    message.success(t('mcp.saved'));
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('mcp.saveFailed'));
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped lang="less">
.nh-extension-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.nh-mcp-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--nh-color-border);
  border-radius: 8px;
  background: var(--nh-color-bg-elevated);
}

.nh-mcp-result {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
}

.nh-mcp-result__id {
  flex: none;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
}

.nh-mcp-result__detail {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
