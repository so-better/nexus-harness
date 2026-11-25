<template>
  <footer class="nh-ask-user__footer" :class="{ 'nh-ask-user__footer--paged': total > 1 }">
    <PagerBar
      v-if="total > 1"
      :index="index"
      :total="total"
      @prev="emit('prev')"
      @next="emit('next')"
    />
    <div class="nh-ask-user__actions">
      <span v-if="showError" class="nh-ask-user__error">{{ t('chat.askUserRequired') }}</span>
      <NButton secondary @click="emit('cancel')">
        {{ t('chat.askUserCancel') }}
      </NButton>
      <NButton
        v-if="total > 1"
        type="primary"
        secondary
        :disabled="index === 0"
        @click="emit('prev')"
      >
        {{ t('chat.askUserPrev') }}
      </NButton>
      <NButton type="primary" :secondary="!isLast" @click="isLast ? emit('submit') : emit('next')">
        {{ isLast ? t('chat.askUserSubmit') : t('chat.askUserNext') }}
      </NButton>
    </div>
  </footer>
</template>

<script setup lang="ts">
/**
 * Ask User 卡片底部分页操作：分页条、取消与上一题/下一题/提交。
 */

import { computed } from 'vue';
import { NButton } from 'naive-ui';
import { t } from '@/app/i18n';
import PagerBar from './PagerBar.vue';

const props = defineProps<{ showError: boolean; index: number; total: number }>();

const emit = defineEmits<{
  cancel: [];
  prev: [];
  next: [];
  submit: [];
}>();

/**
 * 是否为最后一题；只有最后一题才展示提交，避免提前锁定答案。
 */
const isLast = computed(() => props.index >= props.total - 1);
</script>

<style scoped lang="less">
.nh-ask-user__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

// 多问分页时用分隔线与卡片内容隔开；单问题保持原有的无分隔观感
.nh-ask-user__footer--paged {
  padding-top: 12px;
  border-top: 1px solid var(--nh-border-subtle);
}

.nh-ask-user__error {
  color: var(--nh-color-danger);
  font-size: 12px;
}

.nh-ask-user__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}
</style>
