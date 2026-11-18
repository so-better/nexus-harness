<template>
  <div class="nh-welcome__flow">
    <article v-for="(item, index) in capabilities" :key="item.title" class="nh-flow__step">
      <div class="nh-flow__head">
        <span class="nh-flow__icon">
          <AppIcon :name="item.icon" :size="18" />
        </span>
        <span class="nh-flow__index">0{{ index + 1 }}</span>
      </div>
      <h2 class="nh-flow__title">{{ item.title }}</h2>
      <p class="nh-flow__description">{{ item.description }}</p>
    </article>
  </div>
</template>

<script setup lang="ts">
/**
 * 欢迎页执行链：读取、修改、执行与回滚。
 */

import { computed } from 'vue';
import { t } from '@/app/i18n';
import AppIcon from '@/components/AppIcon.vue';

/**
 * 欢迎页展示的四步能力。
 */
const capabilities = computed(() => [
  {
    icon: 'file' as const,
    title: t('welcome.read'),
    description: t('welcome.readDesc')
  },
  {
    icon: 'edit' as const,
    title: t('welcome.write'),
    description: t('welcome.writeDesc')
  },
  {
    icon: 'terminal' as const,
    title: t('welcome.run'),
    description: t('welcome.runDesc')
  },
  {
    icon: 'history' as const,
    title: t('welcome.rollback'),
    description: t('welcome.rollbackDesc')
  }
]);
</script>

<style scoped lang="less">
.nh-welcome__flow {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--nh-color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--nh-color-bg-elevated) 58%, transparent);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.nh-flow__step {
  padding: 16px;
  transition: background var(--nh-duration-base) var(--nh-ease-standard);
}

.nh-flow__step + .nh-flow__step {
  border-left: 1px solid var(--nh-color-border);
}

.nh-flow__step:hover {
  background: color-mix(in srgb, var(--nh-color-bg-base) 70%, transparent);
}

.nh-flow__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.nh-flow__icon {
  color: var(--nh-color-accent);
}

.nh-flow__index {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 12px;
}

.nh-flow__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.nh-flow__description {
  margin: 4px 0 0;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  text-wrap: pretty;
}

@media (width <= 1024px) {
  .nh-welcome__flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nh-flow__step:nth-child(3),
  .nh-flow__step:nth-child(4) {
    border-top: 1px solid var(--nh-color-border);
  }

  .nh-flow__step:nth-child(3) {
    border-left: 0;
  }
}
</style>
