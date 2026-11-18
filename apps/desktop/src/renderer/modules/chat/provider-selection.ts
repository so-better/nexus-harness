/**
 * Provider 选择：维护服务商、模型列表与当前模型。
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { ProviderModel, ProviderPublic } from '@shared/ipc/contracts';
import { listProviders } from './api/chat.api';

interface ProviderSelection {
  providers: Ref<ProviderPublic[]>;
  providerId: Ref<string | undefined>;
  modelId: Ref<string | undefined>;
  models: ComputedRef<ProviderModel[]>;
  refreshProviders: () => Promise<void>;
  setProvider: (id: string) => void;
  setModel: (id: string) => void;
}

/**
 * 创建 Provider 选择状态；错误通过回调交给调用方。
 */
export const useProviderSelection = (onError: (message: string) => void): ProviderSelection => {
  const providers = ref<ProviderPublic[]>([]);
  const providerId = ref<string | undefined>();
  const modelId = ref<string | undefined>();

  const models = computed(
    () => providers.value.find((provider) => provider.id === providerId.value)?.models ?? []
  );

  /**
   * 确保当前模型属于当前 Provider；失效时回退到默认模型。
   */
  const ensureModel = (provider: ProviderPublic | undefined): void => {
    if (!provider) {
      modelId.value = undefined;
      return;
    }
    const current = provider.models.find((model) => model.id === modelId.value);
    modelId.value =
      current?.id ??
      provider.models.find((model) => model.id === provider.defaultModelId)?.id ??
      provider.models[0]?.id;
  };

  /**
   * 重新读取 Provider，并在当前选择失效时回退到第一个启用项。
   */
  const refreshProviders = async (): Promise<void> => {
    try {
      providers.value = await listProviders();
      let current = providers.value.find(
        (provider) => provider.id === providerId.value && provider.enabled
      );
      if (!current) {
        current = providers.value.find((provider) => provider.enabled);
        providerId.value = current?.id;
      }
      ensureModel(current);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  /**
   * 切换当前服务商，并自动选择其默认模型。
   */
  const setProvider = (id: string): void => {
    providerId.value = id;
    ensureModel(providers.value.find((provider) => provider.id === id));
  };

  /**
   * 切换当前模型。
   */
  const setModel = (id: string): void => {
    modelId.value = id;
  };

  return {
    providers,
    providerId,
    modelId,
    models,
    refreshProviders,
    setProvider,
    setModel
  };
};
