<template>
  <article class="nh-run-thinking" aria-live="polite">
    <div class="nh-run-thinking__body">
      <div class="nh-run-thinking__bubble">
        <div class="nh-run-thinking__flow">
          <ThinkingIndicator />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * 首 token 前的助手占位：让运行级光标位于助手消息列，而不是挂在用户操作栏下方。
 */
import ThinkingIndicator from './ThinkingIndicator.vue';

</script>

<style scoped lang="less">
.nh-run-thinking {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.nh-run-thinking__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nh-run-thinking__bubble {
  width: 100%;
  padding: 0;
  border-color: transparent;
  background: transparent;
}

.nh-run-thinking__flow {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
</style>
