<template>
  <div class="nh-terminal-settings">
    <section class="nh-terminal-settings__section">
      <header class="nh-terminal-settings__section-header">
        <h3>{{ t('settings.terminalStartup') }}</h3>
        <p>{{ t('settings.terminalHint') }}</p>
      </header>
      <NForm
        class="nh-terminal-settings__form"
        label-placement="left"
        label-width="80"
        :show-feedback="false"
      >
        <NFormItem :label="t('settings.terminalShell')">
          <div class="nh-terminal-settings__shell">
            <NInput
              :value="shellPath"
              clearable
              :placeholder="t('settings.pleaseInput')"
              @update:value="updateShellPath"
              @blur="saveShell"
              @keydown.enter.prevent="saveShell"
            />
            <NButton secondary @click="chooseShell">
              <template #icon><AppIcon name="folder" :size="14" /></template>
              {{ t('settings.terminalChooseShell') }}
            </NButton>
            <NButton secondary :disabled="usingAuto" @click="useAutoShell">
              {{ t('settings.terminalUseAuto') }}
            </NButton>
          </div>
        </NFormItem>
      </NForm>
    </section>

    <section class="nh-terminal-settings__section">
      <header class="nh-terminal-settings__section-header">
        <h3>{{ t('settings.terminalAiShell') }}</h3>
        <p>{{ t('settings.terminalAiShellHint') }}</p>
      </header>
      <NForm
        class="nh-terminal-settings__form"
        label-placement="left"
        label-width="80"
        :show-feedback="false"
      >
        <NFormItem :label="t('settings.terminalAiShellLabel')">
          <div class="nh-terminal-settings__shell">
            <NInput
              :value="aiShellPath"
              clearable
              :placeholder="t('settings.pleaseInput')"
              @update:value="updateAiShellPath"
              @blur="saveAiShell"
              @keydown.enter.prevent="saveAiShell"
            />
            <NButton secondary @click="chooseAiShell">
              <template #icon><AppIcon name="folder" :size="14" /></template>
              {{ t('settings.terminalChooseShell') }}
            </NButton>
            <NButton secondary :disabled="aiUsingAuto" @click="useAutoAiShell">
              {{ t('settings.terminalUseAuto') }}
            </NButton>
          </div>
        </NFormItem>
      </NForm>
      <p v-if="isWindows" class="nh-terminal-settings__tip">
        <AppIcon name="info" :size="13" />
        <span>{{ t('settings.terminalAiShellTip') }}</span>
      </p>
    </section>

    <section class="nh-terminal-settings__section">
      <header class="nh-terminal-settings__section-header">
        <h3>{{ t('settings.terminalDisplay') }}</h3>
        <p>{{ t('settings.terminalDisplayHint') }}</p>
      </header>
      <NForm
        inline
        class="nh-terminal-settings__form nh-terminal-settings__form--inline"
        label-placement="left"
        label-width="80"
        :show-feedback="false"
      >
        <NFormItem :label="t('settings.terminalFontSize')">
          <NInputNumber
            :value="draft.fontSize"
            :min="9"
            :max="32"
            @update:value="(value) => updateNumber('fontSize', value)"
          />
        </NFormItem>
        <NFormItem :label="t('settings.terminalScrollback')">
          <NInputNumber
            :value="draft.scrollback"
            :min="1000"
            :max="100000"
            :step="1000"
            @update:value="(value) => updateNumber('scrollback', value)"
          />
        </NFormItem>
      </NForm>
      <div class="nh-terminal-settings__switch">
        <div>
          <span>{{ t('settings.terminalCopyOnSelect') }}</span>
          <p>{{ t('settings.terminalCopyOnSelectHint') }}</p>
        </div>
        <NSwitch
          :value="draft.copyOnSelect"
          @update:value="(value) => updateSwitch('copyOnSelect', value)"
        />
      </div>
      <div class="nh-terminal-settings__switch">
        <div>
          <span>{{ t('settings.terminalWebgl') }}</span>
          <p>{{ t('settings.terminalWebglHint') }}</p>
        </div>
        <NSwitch :value="draft.webgl" @update:value="(value) => updateSwitch('webgl', value)" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * 终端设置：shell、字号、滚回与交互选项。
 */

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useMessage, NButton, NForm, NFormItem, NInput, NInputNumber, NSwitch } from 'naive-ui';
import type { TerminalSettings } from '@shared/ipc/contracts';
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import {
  getAppInfo,
  getTerminalAiShellInfo,
  getTerminalSettings,
  getTerminalShellInfo,
  selectTerminalShell,
  setTerminalSettings
} from '../api/settings.api';
import { useShellField } from '../composables/use-shell-field';
import AppIcon from '@/components/AppIcon.vue';

const message = useMessage();
const isWindows = ref(false);
const draft = reactive<TerminalSettings>({ ...DEFAULT_TERMINAL_SETTINGS });

const requestSave = (): void => {
  persist().catch(() => undefined);
};
const onChooseError = (): void => {
  message.error(t('settings.terminalChooseShellFailed'));
};

// 交互式 shell 与 AI 命令 shell 共用同一套状态机
const shellField = useShellField({ choosePath: selectTerminalShell, requestSave, onChooseError });
const aiShellField = useShellField({ choosePath: selectTerminalShell, requestSave, onChooseError });

const {
  path: shellPath,
  usingAuto,
  updatePath: updateShellPath,
  useAuto: useAutoShell,
  choose: chooseShell
} = shellField;
const {
  path: aiShellPath,
  usingAuto: aiUsingAuto,
  updatePath: updateAiShellPath,
  useAuto: useAutoAiShell,
  choose: chooseAiShell
} = aiShellField;

const load = async (): Promise<void> => {
  try {
    const [settings, info, aiInfo] = await Promise.all([
      getTerminalSettings(),
      getTerminalShellInfo(),
      getTerminalAiShellInfo()
    ]);
    Object.assign(draft, settings);
    shellField.load(settings.shell, info);
    aiShellField.load(settings.aiShell, aiInfo);
  } catch {
    message.error(t('settings.terminalLoadFailed'));
  }
  // 平台仅用于提示显隐，失败不影响设置加载
  try {
    const appInfo = await getAppInfo();
    isWindows.value = appInfo.platform === 'win32';
  } catch {
    isWindows.value = false;
  }
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveSequence = 0;
let saveQueue: Promise<void> = Promise.resolve();

async function persist(): Promise<void> {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  const requestId = ++saveSequence;
  const shellRevisionAtRequest = shellField.revision();
  const aiShellRevisionAtRequest = aiShellField.revision();
  const snapshot: TerminalSettings = {
    ...draft,
    shell: shellField.current(),
    aiShell: aiShellField.current()
  };
  saveQueue = saveQueue.then(async () => {
    try {
      const saved = await setTerminalSettings(snapshot);
      if (requestId !== saveSequence) return;
      const [info, aiInfo] = await Promise.all([getTerminalShellInfo(), getTerminalAiShellInfo()]);
      shellField.applySaved(saved.shell, info, shellRevisionAtRequest);
      aiShellField.applySaved(saved.aiShell, aiInfo, aiShellRevisionAtRequest);
    } catch (error) {
      if (requestId === saveSequence) {
        message.error(error instanceof Error ? error.message : t('settings.terminalSaveFailed'));
      }
    }
  });
  await saveQueue;
}

const updateNumber = (key: 'fontSize' | 'scrollback', value: number | null): void => {
  draft[key] =
    typeof value === 'number'
      ? value
      : key === 'fontSize'
        ? DEFAULT_TERMINAL_SETTINGS.fontSize
        : DEFAULT_TERMINAL_SETTINGS.scrollback;
  scheduleSave();
};

const updateSwitch = (key: 'copyOnSelect' | 'webgl', value: boolean): void => {
  draft[key] = value;
  scheduleSave();
};

const scheduleSave = (): void => {
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    persist().catch(() => undefined);
  }, 250);
};

const saveShell = (): void => {
  persist().catch(() => undefined);
};

const saveAiShell = (): void => {
  persist().catch(() => undefined);
};

onBeforeUnmount(() => {
  if (saveTimer !== undefined || shellField.isDirty() || aiShellField.isDirty()) {
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
    persist().catch(() => undefined);
  }
});

onMounted(load);
</script>

<style scoped lang="less">
.nh-terminal-settings {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 14px;
}

.nh-terminal-settings__section {
  padding: 16px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 10px;
  background: var(--nh-color-bg-elevated);
}

.nh-terminal-settings__section-header {
  margin-bottom: 14px;
}

.nh-terminal-settings__section-header h3 {
  margin: 0;
  color: var(--nh-color-text-primary);
  font-size: 13px;
  font-weight: 600;
}

.nh-terminal-settings__section-header p {
  margin: 5px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-terminal-settings__shell {
  display: flex;
  width: 100%;
  gap: 8px;
}

.nh-terminal-settings__shell :deep(.n-input) {
  min-width: 0;
  flex: 1;
}

.nh-terminal-settings__tip {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.nh-terminal-settings__tip :deep(.nh-icon) {
  flex: none;
  margin-top: 1px;
}

.nh-terminal-settings__form :deep(.n-form-item) {
  margin-bottom: 12px;
}

.nh-terminal-settings__form :deep(.n-form-item:last-child) {
  margin-bottom: 0;
}

.nh-terminal-settings__form :deep(.n-input-number) {
  width: 132px;
}

.nh-terminal-settings__form--inline {
  width: 100%;
  gap: 28px;
}

.nh-terminal-settings__form--inline :deep(.n-form-item) {
  width: calc(50% - 14px);
  margin-bottom: 0;
}

.nh-terminal-settings__form--inline :deep(.n-form-item-blank) {
  flex: 1;
}

.nh-terminal-settings__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-terminal-settings__switch span {
  color: var(--nh-color-text-primary);
  font-size: 12px;
}

.nh-terminal-settings__switch p {
  margin: 3px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}
</style>
