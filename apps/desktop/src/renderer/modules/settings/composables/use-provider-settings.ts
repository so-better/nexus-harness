/**
 * Provider 设置状态：列表、表单编辑、保存与删除。
 */

import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import type { SelectOption } from 'naive-ui';
import type { ProviderPublic, ProviderSettings } from '@shared/ipc/contracts';
import { listProviders, removeProvider, saveProvider } from '../api/settings.api';

interface ProviderFormState {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  enabled: boolean;
}

interface ProviderSettingsState {
  providers: Ref<ProviderPublic[]>;
  selectedId: Ref<string | null>;
  providerOptions: ComputedRef<SelectOption[]>;
  providerForm: Ref<ProviderFormState>;
  error: Ref<string | undefined>;
  saved: Ref<boolean>;
  saving: Ref<boolean>;
  selectProvider: (id: string) => void;
  newProvider: () => void;
  saveProviderForm: () => Promise<void>;
  deleteProvider: () => Promise<void>;
}

/**
 * 创建 Provider 设置状态；onChanged 在保存或删除后触发。
 */
export const useProviderSettings = (onChanged: () => void): ProviderSettingsState => {
  const providers = ref<ProviderPublic[]>([]);
  const selectedId = ref<string | null>(null);
  const error = ref<string>();
  const saved = ref(false);
  const saving = ref(false);

  const providerForm = ref<ProviderFormState>({
    name: '',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    enabled: true
  });

  const providerOptions = computed<SelectOption[]>(() =>
    providers.value.map((provider) => ({
      label: `${provider.name} · ${provider.model}`,
      value: provider.id
    }))
  );

  /**
   * 读取 Provider 列表；默认选中第一个。
   */
  const load = async (): Promise<void> => {
    try {
      providers.value = await listProviders();
      if (!selectedId.value && providers.value[0]) selectProvider(providers.value[0].id);
      if (providers.value.length === 0) newProvider();
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  /**
   * 选中并填充 Provider 配置。
   */
  const selectProvider = (id: string): void => {
    const provider = providers.value.find((item) => item.id === id);
    if (!provider) return;
    selectedId.value = provider.id;
    providerForm.value.name = provider.name;
    providerForm.value.baseUrl = provider.baseUrl;
    providerForm.value.model = provider.model;
    providerForm.value.apiKey = '';
    providerForm.value.contextWindow = provider.contextWindow;
    providerForm.value.maxOutputTokens = provider.maxOutputTokens;
    providerForm.value.enabled = provider.enabled;
    error.value = undefined;
    saved.value = false;
  };

  /**
   * 清空表单以新增配置。
   */
  const newProvider = (): void => {
    selectedId.value = null;
    providerForm.value = {
      name: '',
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      apiKey: '',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      enabled: true
    };
    error.value = undefined;
    saved.value = false;
  };

  /**
   * 保存当前配置；编辑时 API Key 留空表示保留。
   */
  const saveProviderForm = async (): Promise<void> => {
    saving.value = true;
    error.value = undefined;
    saved.value = false;
    try {
      const input: ProviderSettings = {
        name: providerForm.value.name.trim(),
        baseUrl: providerForm.value.baseUrl.trim(),
        model: providerForm.value.model.trim(),
        enabled: providerForm.value.enabled,
        ...(selectedId.value ? { id: selectedId.value } : {}),
        ...(providerForm.value.apiKey.trim() ? { apiKey: providerForm.value.apiKey.trim() } : {}),
        ...(providerForm.value.contextWindow === null
          ? {}
          : { contextWindow: providerForm.value.contextWindow }),
        ...(providerForm.value.maxOutputTokens === null
          ? {}
          : { maxOutputTokens: providerForm.value.maxOutputTokens })
      };
      const result = await saveProvider(input);
      selectedId.value = result.id;
      saved.value = true;
      await load();
      onChanged();
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      saving.value = false;
    }
  };

  /**
   * 删除当前选中的 Provider。
   */
  const deleteProvider = async (): Promise<void> => {
    if (!selectedId.value) return;
    try {
      await removeProvider(selectedId.value);
      selectedId.value = null;
      await load();
      onChanged();
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  };

  onMounted(load);

  return {
    providers,
    selectedId,
    providerOptions,
    providerForm,
    error,
    saved,
    saving,
    selectProvider,
    newProvider,
    saveProviderForm,
    deleteProvider
  };
};
