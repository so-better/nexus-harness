<template>
  <section class="nh-extension-panel nh-mcp">
    <div class="nh-extension-panel__header">
      <div class="nh-mcp__header-copy">
        <p>{{ t('mcp.hint') }}</p>
        <p class="nh-mcp__token-hint">{{ t('mcp.tokenHint') }}</p>
      </div>
      <div class="nh-extension-panel__actions">
        <NButton type="primary" :loading="saving" @click="save()">
          <template #icon><AppIcon name="check" :size="14" /></template>
          {{ t('mcp.save') }}
        </NButton>
        <NButton type="primary" secondary :loading="loading" @click="load">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          {{ t('mcp.refresh') }}
        </NButton>
        <NButton type="primary" tertiary :loading="testing" @click="test">
          <template #icon><AppIcon name="play" :size="14" /></template>
          {{ t('mcp.test') }}
        </NButton>
        <NButton secondary @click="openFolder">
          <template #icon><AppIcon name="folder" :size="14" /></template>
          {{ t('mcp.openDirectory') }}
        </NButton>
      </div>
    </div>

    <section v-if="testResults.length" class="nh-mcp__card nh-mcp__test-card">
      <header class="nh-mcp__card-head">
        <div class="nh-mcp__test-heading">
          <span>{{ t('mcp.test') }}</span>
          <span class="nh-mcp__count">{{ testResults.length }}</span>
        </div>
        <NButton
          text
          :title="t('mcp.closeResult')"
          :aria-label="t('mcp.closeResult')"
          @click="closeTestResults"
        >
          <template #icon><AppIcon name="close" :size="15" /></template>
        </NButton>
      </header>
      <div class="nh-mcp__result-list">
        <div
          v-for="result in testResults"
          :key="result.id"
          class="nh-mcp__result"
          :class="{
            'nh-mcp__result--ok': result.ok && !result.skipped,
            'nh-mcp__result--error': !result.ok,
            'nh-mcp__result--skipped': result.skipped
          }"
        >
          <div class="nh-mcp__result-main">
            <NTag
              size="tiny"
              :bordered="false"
              :type="result.skipped ? 'warning' : result.ok ? 'success' : 'error'"
            >
              <template #icon>
                <AppIcon
                  :name="result.skipped ? 'info' : result.ok ? 'check' : 'alert'"
                  :size="12"
                />
              </template>
              {{
                result.skipped
                  ? t('mcp.testSkipped')
                  : result.ok
                    ? t('mcp.testOk')
                    : t('mcp.testError')
              }}
            </NTag>
            <span class="nh-mcp__result-id">{{ result.id }}</span>
          </div>
          <NTooltip v-if="result.skipped" placement="top-end">
            <template #trigger>
              <p class="nh-mcp__result-hint" tabindex="0">{{ t('mcp.testSkippedHint') }}</p>
            </template>
            <span
              style="display: block; max-width: 420px; overflow-wrap: anywhere; white-space: normal"
              >{{ t('mcp.testSkippedHint') }}</span
            >
          </NTooltip>
          <div v-else-if="result.ok" class="nh-mcp__metrics">
            <span
              ><strong>{{ result.tools ?? 0 }}</strong> tools</span
            >
            <span
              ><strong>{{ result.resources ?? 0 }}</strong> resources</span
            >
            <span
              ><strong>{{ result.prompts ?? 0 }}</strong> prompts</span
            >
          </div>
          <NTooltip v-else placement="top-end">
            <template #trigger>
              <p class="nh-mcp__result-error" tabindex="0">{{ result.error }}</p>
            </template>
            <span
              style="display: block; max-width: 420px; overflow-wrap: anywhere; white-space: normal"
              >{{ result.error }}</span
            >
          </NTooltip>
        </div>
      </div>
    </section>

    <section v-if="serverEntries.length" class="nh-mcp__card nh-mcp__server-card">
      <header class="nh-mcp__card-head">
        <span>{{ t('mcp.servers') }}</span>
        <span class="nh-mcp__count">{{ enabledCount }} / {{ serverEntries.length }}</span>
      </header>
      <div class="nh-mcp__server-list">
        <div v-for="server in serverEntries" :key="server.id" class="nh-mcp__server">
          <span class="nh-mcp__dot" :class="{ 'nh-mcp__dot--on': server.enabled }" />
          <span class="nh-mcp__server-id">{{ server.id }}</span>
          <span v-if="server.preparing" class="nh-mcp__server-preparing">
            {{ t('mcp.preparing') }}
          </span>
          <NTooltip v-else-if="server.error" placement="top-end">
            <template #trigger>
              <span class="nh-mcp__server-error" tabindex="0">{{ server.error }}</span>
            </template>
            <span
              style="display: block; max-width: 420px; overflow-wrap: anywhere; white-space: normal"
              >{{ server.error }}</span
            >
          </NTooltip>
          <NSwitch
            size="small"
            :value="server.enabled"
            @update:value="toggleServer(server.id, $event)"
          />
        </div>
      </div>
    </section>

    <section class="nh-mcp__card nh-mcp__editor-card">
      <header class="nh-mcp__card-head">
        <span>{{ t('mcp.jsonConfig') }}</span>
        <span class="nh-mcp__count">JSON</span>
      </header>
      <MonacoEditor
        v-model="jsonText"
        language="json"
        height="min(420px, 44vh)"
        class="nh-mcp-editor"
      />
    </section>
  </section>
</template>

<script setup lang="ts">
/**
 * 扩展页 MCP 编辑：直接维护单个标准 mcp.json。
 */

import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { NButton, NSwitch, NTag, NTooltip, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';
import { openDataLocation } from '@/app/data-location.api';
import { getMcpStatus, loadMcpConfig, saveMcpConfig, testMcpConfig } from '../api/mcp.api';
import type { McpServerStatus, McpTestServerResult } from '@shared/mcp';

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'));

const message = useMessage();
const jsonText = ref('');
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResults = ref<McpTestServerResult[]>([]);
const openFolder = async (): Promise<void> => {
  try {
    await openDataLocation('mcp');
  } catch (reason) {
    message.error(reason instanceof Error ? reason.message : t('extensions.openFailed'));
  }
};

const closeTestResults = (): void => {
  testResults.value = [];
};
const serverStatuses = ref<Record<string, McpServerStatus>>({});

interface ServerEntry {
  id: string;
  enabled: boolean;
  preparing?: boolean;
  error?: string;
}

/**
 * 从当前 JSON 中提取启用状态，避免用户只能手改 enabled 字段。
 */
const serverEntries = computed<ServerEntry[]>(() => {
  try {
    const raw = JSON.parse(jsonText.value) as { mcpServers?: unknown };
    if (!raw.mcpServers || typeof raw.mcpServers !== 'object' || Array.isArray(raw.mcpServers)) {
      return [];
    }
    return Object.entries(raw.mcpServers as Record<string, unknown>).map(([id, value]) => {
      const status = serverStatuses.value[id];
      return {
        id,
        enabled:
          value && typeof value === 'object' && 'enabled' in value
            ? (value as { enabled?: unknown }).enabled !== false
            : true,
        ...(status?.preparing ? { preparing: true } : {}),
        ...(status?.error ? { error: status.error } : {})
      };
    });
  } catch {
    return [];
  }
});

const enabledCount = computed(() => serverEntries.value.filter((server) => server.enabled).length);

/**
 * 读取最近一次连接状态，启动失败的 Server 在列表中显示错误。
 */
const loadStatus = async (): Promise<void> => {
  try {
    const statuses = await getMcpStatus();
    serverStatuses.value = Object.fromEntries(statuses.map((status) => [status.id, status]));
  } catch {
    serverStatuses.value = {};
  }
};

/**
 * 直接修改 JSON 中的 enabled；修改后自动保存，避免用户忘记点击保存。
 */
const toggleServer = async (id: string, enabled: boolean): Promise<void> => {
  const previous = jsonText.value;
  try {
    const raw = JSON.parse(previous) as { mcpServers?: Record<string, unknown> };
    const server = raw.mcpServers?.[id];
    if (!server || typeof server !== 'object') return;
    raw.mcpServers![id] = { ...server, enabled };
    jsonText.value = JSON.stringify(raw, null, 2);
    const saved = await save(false);
    if (!saved) jsonText.value = previous;
  } catch {
    message.error(t('mcp.invalidJson'));
  }
};

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
    await loadStatus();
  } catch (reason) {
    testResults.value = [];
    message.error(reason instanceof Error ? reason.message : t('mcp.testFailed'));
  } finally {
    testing.value = false;
  }
};

let saveQueue: Promise<boolean> = Promise.resolve(true);

/**
 * 保存配置；开关切换走静默保存，手动保存才提示成功。
 * 返回 false 时调用方可以恢复此前的 UI 状态。
 */
const save = async (notify = true): Promise<boolean> => {
  const text = jsonText.value;
  saveQueue = saveQueue
    .catch(() => false)
    .then(async () => {
      saving.value = true;
      try {
        await saveMcpConfig(text);
        if (notify) message.success(t('mcp.saved'));
        return true;
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : t('mcp.saveFailed'));
        return false;
      } finally {
        saving.value = false;
      }
    });
  const saved = await saveQueue;
  await loadStatus();
  return saved;
};

onMounted(async () => {
  await load();
  await loadStatus();
});
</script>

<style scoped lang="less">
.nh-mcp {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
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

.nh-mcp__header-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.nh-mcp__token-hint {
  color: var(--nh-color-warning);
  font-size: 11px;
}

.nh-extension-panel__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.nh-mcp__card {
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 12px;
  background: var(--nh-color-bg-base);
}

// server 卡片撑满剩余高度，列表自身滚动；JSON 编辑器卡片保持自身滚动
.nh-mcp__server-card {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.nh-mcp__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--nh-border-subtle);
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.nh-mcp__count {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 11px;
  font-weight: 400;
}

.nh-mcp__server-list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow-y: auto;
}

.nh-mcp__server {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.nh-mcp__server + .nh-mcp__server {
  border-top: 1px solid color-mix(in srgb, var(--nh-border-subtle) 65%, transparent);
}

.nh-mcp__dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--nh-color-text-disabled);
}

.nh-mcp__dot--on {
  background: var(--nh-color-success);
}

.nh-mcp__server-preparing {
  overflow: hidden;
  max-width: 120px;
  color: var(--nh-color-warning);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-mcp__server-error {
  overflow: hidden;
  max-width: 120px;
  color: var(--nh-color-danger);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-mcp__server-id {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-mcp__editor-card .nh-mcp-editor {
  border-radius: 0;
}

.nh-mcp__test-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nh-mcp__result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.nh-mcp__result {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
  background: transparent;
}

.nh-mcp__result--ok {
  border-color: color-mix(in srgb, var(--nh-color-success) 24%, var(--nh-border-subtle));
}

.nh-mcp__result--error {
  border-color: color-mix(in srgb, var(--nh-color-danger) 24%, var(--nh-border-subtle));
}

.nh-mcp__result--skipped {
  border-color: color-mix(in srgb, var(--nh-color-warning) 24%, var(--nh-border-subtle));
}

.nh-mcp__result-main {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  align-items: center;
  gap: 8px;
}

.nh-mcp__result-id {
  min-width: 0;
  overflow: hidden;
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-mcp__metrics {
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  gap: 14px;
  margin-left: auto;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-mcp__metrics strong {
  color: var(--nh-color-text-primary);
  font-weight: 600;
}

.nh-mcp__result-hint,
.nh-mcp__result-error {
  min-width: 0;
  max-width: 62%;
  margin: 0 0 0 auto;
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-mcp__result-error {
  color: var(--nh-color-danger);
}
</style>
