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
import type { TerminalSettings, TerminalShellInfo } from '@shared/ipc/contracts';
import { DEFAULT_TERMINAL_SETTINGS } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import {
  getTerminalSettings,
  getTerminalShellInfo,
  selectTerminalShell,
  setTerminalSettings
} from '../api/settings.api';
import AppIcon from '@/components/AppIcon.vue';

const message = useMessage();
const usingAuto = ref(true);
const shellPath = ref('');
const shellInfo = ref<TerminalShellInfo>();
let shellDirty = false;
let shellRevision = 0;
const draft = reactive<TerminalSettings>({ ...DEFAULT_TERMINAL_SETTINGS });

const load = async (): Promise<void> => {
  try {
    const [settings, info] = await Promise.all([getTerminalSettings(), getTerminalShellInfo()]);
    Object.assign(draft, settings);
    shellInfo.value = info;
    usingAuto.value = !settings.shell;
    shellPath.value = settings.shell ?? info.path;
  } catch {
    message.error(t('settings.terminalLoadFailed'));
  }
};

const updateShellPath = (value: string): void => {
  shellPath.value = value;
  usingAuto.value = false;
  shellDirty = true;
  shellRevision += 1;
};

const useAutoShell = (): void => {
  usingAuto.value = true;
  shellPath.value = shellInfo.value?.path ?? '';
  shellDirty = true;
  shellRevision += 1;
  persist().catch(() => undefined);
};

const chooseShell = async (): Promise<void> => {
  try {
    const path = await selectTerminalShell();
    if (!path) return;
    usingAuto.value = false;
    shellPath.value = path;
    shellDirty = true;
    shellRevision += 1;
    await persist();
  } catch {
    message.error(t('settings.terminalChooseShellFailed'));
  }
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveSequence = 0;
let saveQueue: Promise<void> = Promise.resolve();

const currentShell = (): string | null =>
  usingAuto.value || !shellPath.value.trim() ? null : shellPath.value.trim();

const persist = async (): Promise<void> => {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  const requestId = ++saveSequence;
  const shellRevisionAtRequest = shellRevision;
  const snapshot: TerminalSettings = { ...draft, shell: currentShell() };
  saveQueue = saveQueue.then(async () => {
    try {
      const saved = await setTerminalSettings(snapshot);
      if (requestId !== saveSequence) return;
      usingAuto.value = !saved.shell;
      const info = await getTerminalShellInfo();
      shellInfo.value = info;
      shellPath.value = saved.shell ?? info.path;
      if (shellRevisionAtRequest === shellRevision) shellDirty = false;
    } catch (error) {
      if (requestId === saveSequence) {
        message.error(error instanceof Error ? error.message : t('settings.terminalSaveFailed'));
      }
    }
  });
  await saveQueue;
};

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

onBeforeUnmount(() => {
  if (saveTimer !== undefined || shellDirty) {
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
