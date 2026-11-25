<template>
  <ApprovalCard
    v-if="current"
    :key="current.approval.id"
    :approval="current.approval"
    :tool="current.tool"
    :session-id="sessionId"
    :message-id="messageId"
    :run-id="runId"
    :data-approval-id="current.approval.id"
    @approve="emit('approve', current.approval.id)"
    @reject="emit('reject', current.approval.id)"
  >
    <template #footer-left>
      <PagerBar
        v-if="items.length > 1"
        :index="index"
        :total="items.length"
        @prev="goPrev"
        @next="goNext"
      />
    </template>
  </ApprovalCard>
</template>

<script setup lang="ts">
/**
 * 审批分页：同一轮出现多个待审批时逐项展示，避免审批卡自上而下铺开。
 * 分页条与 ask 卡片一致，放在卡片底部左侧。
 */

import { computed, ref, watch } from 'vue';
import type { ChatApproval, ChatToolCall } from '../types';
import ApprovalCard from './ApprovalCard.vue';
import PagerBar from './PagerBar.vue';

interface ApprovalPagerItem {
  approval: ChatApproval;
  tool?: ChatToolCall;
}

const props = defineProps<{
  items: ApprovalPagerItem[];
  sessionId?: string | undefined;
  messageId?: string | undefined;
  runId?: string | undefined;
}>();

const emit = defineEmits<{ approve: [approvalId: string]; reject: [approvalId: string] }>();

const index = ref(0);
const current = computed<ApprovalPagerItem | undefined>(() => props.items[index.value]);

/**
 * 某项被批准或拒绝后列表会缩短，夹紧索引避免停在空页。
 */
watch(
  () => props.items.length,
  (length) => {
    if (length === 0) {
      index.value = 0;
      return;
    }
    if (index.value > length - 1) index.value = length - 1;
  }
);

const goPrev = (): void => {
  if (index.value > 0) index.value -= 1;
};

const goNext = (): void => {
  if (index.value < props.items.length - 1) index.value += 1;
};
</script>
