/**
 * Provider 设置状态：服务商、多模型、连接测试与保存。
 */

import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useMessage, type SelectOption } from 'naive-ui';
import type {
  ProviderModel,
  ProviderProtocol,
  ProviderPublic,
  ProviderSettings
} from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { listProviders, removeProvider, saveProvider, testProvider } from '../api/settings.api';
import { defaultProviderExtraParams } from '@shared/provider-params';
import { parseExtraParams } from '../validation/extra-params';

export interface ProviderFormState {
  protocol: ProviderProtocol;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: ProviderModel[];
  defaultModelId: string;
  reasoningPassback: boolean;
  extraParamsText: string;
}

interface ProviderSettingsState {
  providers: Ref<ProviderPublic[]>;
  selectedId: Ref<string | null>;
  providerOptions: ComputedRef<SelectOption[]>;
  providerForm: Ref<ProviderFormState>;
  saving: Ref<boolean>;
  availableModels: Ref<string[]>;
  testing: Ref<boolean>;
  testConnection: () => Promise<void>;
  selectProvider: (id: string) => void;
  newProvider: () => void;
  saveProviderForm: () => Promise<void>;
  toggleProvider: (id: string, enabled: boolean) => Promise<void>;
  deleteProviderById: (id: string) => Promise<void>;
  deleteProvider: () => Promise<void>;
}

/**
 * 创建 Provider 设置状态；onChanged 在保存或删除后触发。
 */
const extraParamsTextFor = (protocol: ProviderProtocol): string => {
  const defaults = defaultProviderExtraParams(protocol);
  return defaults ? JSON.stringify(defaults, null, 2) : '';
};

export const useProviderSettings = (
  onChanged: (action: 'saved' | 'deleted') => void
): ProviderSettingsState => {
  const message = useMessage();
  const providers = ref<ProviderPublic[]>([]);
  const selectedId = ref<string | null>(null);
  const saving = ref(false);
  const availableModels = ref<string[]>([]);
  const testing = ref(false);
  const autoFetched = new Set<string>();

  let lastNonAnthropicPassback = true;
  const providerForm = ref<ProviderFormState>({
    protocol: 'openai',
    name: '',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    models: [],
    defaultModelId: '',
    reasoningPassback: false,
    extraParamsText: ''
  });

  watch(
    () => providerForm.value.protocol,
    (protocol, previous) => {
      const previousDefault = extraParamsTextFor(previous);
      if (
        !providerForm.value.extraParamsText.trim() ||
        providerForm.value.extraParamsText === previousDefault
      ) {
        providerForm.value.extraParamsText = extraParamsTextFor(protocol);
      }
      if (protocol === 'anthropic') {
        providerForm.value.reasoningPassback = false;
      } else if (previous === 'anthropic') {
        providerForm.value.reasoningPassback = lastNonAnthropicPassback;
      }
    }
  );

  watch(
    () => providerForm.value.reasoningPassback,
    (value) => {
      if (providerForm.value.protocol !== 'anthropic') {
        lastNonAnthropicPassback = value;
      }
    }
  );

  const providerOptions = computed<SelectOption[]>(() =>
    providers.value.map((provider) => ({
      label: `${provider.name} · ${provider.models.length} 个模型`,
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
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
    }
  };

  /**
   * 选中并填充 Provider 配置。
   */
  const selectProvider = (id: string): void => {
    const provider = providers.value.find((item) => item.id === id);
    if (!provider) return;
    selectedId.value = provider.id;
    if (provider.protocol !== 'anthropic') {
      lastNonAnthropicPassback = provider.reasoningPassback !== false;
    }
    providerForm.value = {
      protocol: provider.protocol,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      enabled: provider.enabled,
      models: provider.models.map((model) => ({ ...model })),
      defaultModelId: provider.defaultModelId,
      reasoningPassback: provider.reasoningPassback !== false,
      extraParamsText: provider.extraParams
        ? JSON.stringify(provider.extraParams, null, 2)
        : extraParamsTextFor(provider.protocol)
    };
    availableModels.value = provider.models.map((model) => model.id);
    if (!autoFetched.has(provider.id) && provider.baseUrl.trim()) {
      autoFetched.add(provider.id);
      testConnection(true).catch(() => undefined);
    }
  };

  /**
   * 清空表单以新增配置。
   */
  const newProvider = (): void => {
    selectedId.value = null;
    lastNonAnthropicPassback = true;
    providerForm.value = {
      protocol: 'openai',
      name: '',
      baseUrl: '',
      apiKey: '',
      enabled: true,
      models: [],
      defaultModelId: '',
      reasoningPassback: true,
      extraParamsText: extraParamsTextFor('openai')
    };
    availableModels.value = [];
  };

  /**
   * 保存当前配置；API Key 留空时保留原值。
   */
  const saveProviderForm = async (): Promise<void> => {
    saving.value = true;
    try {
      const models = providerForm.value.models.map((model) => ({
        id: model.id.trim(),
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        ...(model.reasoningPassback === undefined
          ? {}
          : { reasoningPassback: model.reasoningPassback })
      }));
      const extraParams = parseExtraParams(
        providerForm.value.extraParamsText,
        t('settings.extraParamsInvalid')
      );
      const defaultModelId = models.some((model) => model.id === providerForm.value.defaultModelId)
        ? providerForm.value.defaultModelId
        : (models[0]?.id ?? '');

      const input: ProviderSettings = {
        protocol: providerForm.value.protocol,
        name: providerForm.value.name.trim(),
        baseUrl: providerForm.value.baseUrl.trim(),
        enabled: providerForm.value.enabled,
        models,
        defaultModelId,
        reasoningPassback: providerForm.value.reasoningPassback,
        extraParams,
        ...(selectedId.value ? { id: selectedId.value } : {}),
        ...(providerForm.value.apiKey.trim() ? { apiKey: providerForm.value.apiKey.trim() } : {})
      };
      const result = await saveProvider(input);
      selectedId.value = result.id;
      await load();
      message.success(t('settings.saved'));
      onChanged('saved');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
    } finally {
      saving.value = false;
    }
  };

  /**
   * 测试当前表单连接；新配置无需先保存。
   */
  const testConnection = async (silent = false): Promise<void> => {
    if (testing.value) return;
    if (
      !silent &&
      providerForm.value.protocol !== 'ollama' &&
      !providerForm.value.apiKey.trim() &&
      !selectedId.value
    ) {
      message.warning(t('settings.testRequiresApiKey'));
      return;
    }

    testing.value = true;
    try {
      const result = await testProvider({
        protocol: providerForm.value.protocol,
        baseUrl: providerForm.value.baseUrl.trim(),
        ...(providerForm.value.apiKey.trim() ? { apiKey: providerForm.value.apiKey.trim() } : {}),
        ...(selectedId.value ? { id: selectedId.value } : {})
      });
      availableModels.value = result.models;
      if (silent) return;
      if (result.models.length > 0) {
        message.success(
          `${t('settings.testSuccess')} ${result.models.length} ${t('settings.modelUnit')} (${result.latencyMs}ms)`
        );
      } else {
        message.warning(t('settings.testNoModels'));
      }
    } catch (reason) {
      if (!silent)
        message.error(reason instanceof Error ? reason.message : t('settings.testFailed'));
    } finally {
      testing.value = false;
    }
  };

  /**
   * 在列表中直接启用或停用一个 Provider。
   */
  const toggleProvider = async (id: string, enabled: boolean): Promise<void> => {
    const provider = providers.value.find((item) => item.id === id);
    if (!provider) return;
    try {
      await saveProvider({
        id: provider.id,
        protocol: provider.protocol,
        name: provider.name,
        baseUrl: provider.baseUrl,
        enabled,
        models: provider.models,
        defaultModelId: provider.defaultModelId,
        reasoningPassback: provider.reasoningPassback !== false,
        extraParams: provider.extraParams ?? {}
      });
      await load();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
    }
  };

  /**
   * 在列表中直接删除指定 Provider。
   */
  const deleteProviderById = async (id: string): Promise<void> => {
    try {
      await removeProvider(id);
      if (selectedId.value === id) selectedId.value = null;
      await load();
      message.success(t('settings.deleted'));
      onChanged('deleted');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
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
      message.success(t('settings.deleted'));
      onChanged('deleted');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : t('settings.loadFailed'));
    }
  };

  onMounted(load);

  return {
    providers,
    selectedId,
    providerOptions,
    providerForm,
    saving,
    availableModels,
    testing,
    testConnection,
    selectProvider,
    newProvider,
    saveProviderForm,
    toggleProvider,
    deleteProviderById,
    deleteProvider
  };
};
