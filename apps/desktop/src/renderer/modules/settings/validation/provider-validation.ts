/**
 * Provider 表单校验：Naive UI FormRules，保持中文错误信息。
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import type { FormRules } from 'naive-ui';
import type { ProviderModel } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import type { ProviderFormState } from '../composables/use-provider-settings';

/**
 * 创建 Provider 表单规则；编辑已有配置时 API Key 可留空。
 */
export const createProviderRules = (
  selectedId: Ref<string | null>,
  providerForm: Ref<ProviderFormState>
): ComputedRef<FormRules> =>
  computed<FormRules>(() => {
    const baseRules: FormRules = {
      name: {
        required: true,
        message: t('settings.validationName'),
        trigger: ['input', 'blur']
      },
      baseUrl: {
        required: true,
        trigger: ['input', 'blur'],
        validator: (_rule: unknown, value: string): true | Error => {
          if (!value) return new Error(t('settings.validationBaseUrl'));
          if (!/^https?:\/\//i.test(value)) return new Error(t('settings.validationBaseUrl'));
          return true;
        }
      },
      models: {
        required: true,
        trigger: ['change', 'blur'],
        validator: (_rule: unknown, value: ProviderModel[]): true | Error => {
          if (!Array.isArray(value) || value.length === 0) {
            return new Error(t('settings.validationModels'));
          }
          for (const model of value) {
            if (!model.id.trim()) return new Error(t('settings.validationModel'));
            if (model.contextWindow < 4_096) {
              return new Error(t('settings.validationContextWindow'));
            }
            if (model.maxOutputTokens < 256 || model.maxOutputTokens >= model.contextWindow) {
              return new Error(t('settings.validationMaxOutput'));
            }
          }
          if (!value.some((model) => model.id === providerForm.value.defaultModelId)) {
            return new Error(t('settings.validationDefaultModel'));
          }
          return true;
        }
      }
    };

    if (!selectedId.value && providerForm.value.protocol !== 'ollama') {
      baseRules['apiKey'] = {
        required: true,
        message: t('settings.validationApiKey'),
        trigger: ['input', 'blur']
      };
    }

    return baseRules;
  });
