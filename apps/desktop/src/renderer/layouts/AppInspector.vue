<template>
  <aside class="nh-inspector">
    <h2 class="nh-inspector__title">{{ t('app.inspector') }}</h2>
    <dl class="nh-inspector__usage">
      <div>
        <dt>{{ t('app.tokensIn') }}</dt>
        <dd>{{ usage.inputTokens }}</dd>
      </div>
      <div>
        <dt>{{ t('app.tokensOut') }}</dt>
        <dd>{{ usage.outputTokens }}</dd>
      </div>
      <div>
        <dt>{{ t('app.cost') }}</dt>
        <dd>{{ usage.cost.toFixed(4) }}</dd>
      </div>
    </dl>
    <p v-for="message in errors" :key="message" class="nh-inspector__error">{{ message }}</p>
  </aside>
</template>

<script setup lang="ts">
/**
 * 检查器：展示当前会话用量与错误，不承载业务状态。
 */

import type { ChatUsage } from '@/modules/chat/types';
import { t } from '@/app/i18n';

defineProps<{
  usage: ChatUsage;
  errors: string[];
}>();
</script>

<style scoped lang="less">
.nh-inspector {
  min-width: 0;
  overflow: auto;
  padding: 16px;
  border-left: 1px solid var(--nh-color-border);
  background: var(--nh-color-bg-elevated);
}

.nh-inspector__title {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
}

.nh-inspector__usage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.nh-inspector__usage div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.nh-inspector__usage dt,
.nh-inspector__usage dd {
  margin: 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-inspector__usage dd {
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
}

.nh-inspector__error {
  color: var(--nh-color-danger);
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>
