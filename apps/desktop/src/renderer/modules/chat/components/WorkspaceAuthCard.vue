<template>
  <AuthorizationCard
    :title="t('workspaceAuth.title')"
    icon="folder"
    :warning="t('workspaceAuth.hint')"
    @approve="emit('allow')"
    @reject="emit('reject')"
  >
    <code
      class="nh-workspace-auth-path"
      :title="request.suggestedPath"
      v-text="request.suggestedPath"
    />
  </AuthorizationCard>
</template>

<script setup lang="ts">
/**
 * 会话流内目录授权卡：复用通用授权卡。
 */

import type { WorkspaceAuthorizationRequest } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import AuthorizationCard from './AuthorizationCard.vue';

defineProps<{ request: WorkspaceAuthorizationRequest }>();
const emit = defineEmits<{ allow: []; reject: [] }>();
</script>

<style scoped lang="less">
.nh-workspace-auth-path {
  display: block;
  margin-top: 10px;
  padding: 9px 11px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--nh-color-accent) 16%, var(--nh-border-subtle));
  border-radius: 8px;
  background: color-mix(in srgb, var(--nh-surface-elevated) 86%, transparent);
  color: var(--nh-color-text-primary);
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
