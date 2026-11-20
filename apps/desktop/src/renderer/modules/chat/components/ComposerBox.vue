<template>
  <form class="nh-composer" :class="{ 'nh-composer--hero': hero }" @submit.prevent="submit">
    <div class="nh-composer__toolbar">
      <ComposerRootPicker
        :roots="roots"
        @choose-root="emit('choose-root')"
        @remove-root="emit('remove-root', $event)"
      />
      <div class="nh-composer__toolbar-right">
        <PluginSlot
          v-if="sessionId"
          location="composer.toolbar"
          :context="{ location: 'composer.toolbar', sessionId, usage }"
        />
        <ComposerModelPicker
          :providers="providers"
          :models="models"
          :provider-id="providerId"
          :model-id="modelId"
          @update-provider="emit('update-provider', $event)"
          @update-model="emit('update-model', $event)"
          @open-settings="emit('open-settings')"
        />
      </div>
    </div>
    <ComposerFileReference
      v-if="referenceOpen"
      :references="references"
      :active-index="activeIndex"
      :searching="searching"
      @select="selectReference"
    />
    <PluginSlot
      v-if="sessionId"
      location="composer.above"
      :context="{ location: 'composer.above', sessionId, usage }"
    />
    <NPopover
      :show="skillOpen && skillItems.length > 0"
      trigger="manual"
      placement="top-start"
      :show-arrow="false"
      :style="{ width: 'min(420px, calc(100vw - 48px))' }"
    >
      <template #trigger>
        <NInput
          ref="inputRef"
          v-model:value="draft"
          type="textarea"
          :bordered="false"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="placeholder"
          :disabled="disabled || running"
          @keydown="onComposerKeydown"
          @blur="onInputBlur"
        />
      </template>
      <div ref="skillListRef" class="nh-composer__skills" role="listbox">
        <div class="nh-composer__skills-header">
          <span>{{ t('chat.skillTitle') }}</span>
          <span class="nh-composer__skills-count">{{ skillItems.length }}</span>
        </div>
        <button
          v-for="(skill, index) in skillItems"
          :key="skill.id"
          type="button"
          class="nh-composer__skill"
          :class="{ 'nh-composer__skill--active': index === skillActiveIndex }"
          role="option"
          :aria-selected="index === skillActiveIndex"
          @mouseenter="skillActiveIndex = index"
          @mousedown.prevent="chooseSkill(skill.id)"
        >
          <span class="nh-composer__skill-icon">
            <AppIcon name="spark" :size="14" />
          </span>
          <span class="nh-composer__skill-copy">
            <span class="nh-composer__skill-name">/{{ skill.id }}</span>
            <span class="nh-composer__skill-description">{{ skill.description }}</span>
          </span>
        </button>
      </div>
    </NPopover>
    <ComposerFileChips :files="selectedReferences" @remove="removeReference" />
    <PluginSlot
      v-if="sessionId"
      location="composer.footer"
      :context="{ location: 'composer.footer', sessionId, usage }"
    />
    <ComposerActions
      :disabled="disabled"
      :disabled-reason="disabledReason"
      :running="running"
      :mode="mode"
      :can-send="Boolean(draft.trim() || selectedReferences.length)"
      :can-reference="roots.length > 0"
      @stop="emit('stop')"
      @update-mode="emit('update-mode', $event)"
    />
  </form>
</template>

<script setup lang="ts">
/**
 * 输入区：消息发送、文件引用和模型/工作区选择。
 */

import { computed, nextTick, ref, toRef, watch } from 'vue';
import { NInput, NPopover, type InputInst } from 'naive-ui';
import type { MessageFileReference } from '@shared/events';
import type { AgentMode, ProviderModel, ProviderPublic, SessionRoot } from '@shared/ipc/contracts';
import { t } from '@/app/i18n';
import { useComposerReferences } from '../use-composer-references';
import { useFileReference } from '../use-file-reference';
import ComposerActions from './ComposerActions.vue';
import ComposerFileChips from './ComposerFileChips.vue';
import ComposerFileReference from './ComposerFileReference.vue';
import ComposerModelPicker from './ComposerModelPicker.vue';
import ComposerRootPicker from './ComposerRootPicker.vue';
import PluginSlot from '@/plugin-runtime/components/PluginSlot.vue';
import type { ChatUsage } from '../types';
import type { SkillSummary } from '@shared/skills';
import { listSkills } from '../api/skills.api';

const props = defineProps<{
  disabled: boolean;
  disabledReason?: string | undefined;
  running: boolean;
  roots: SessionRoot[];
  providers: ProviderPublic[];
  models: ProviderModel[];
  mode: AgentMode;
  sessionId?: string | undefined;
  usage?: ChatUsage | undefined;
  providerId?: string | undefined;
  modelId?: string | undefined;
  hero?: boolean;
}>();

const emit = defineEmits<{
  send: [prompt: string, imagePaths?: string[], references?: MessageFileReference[]];
  stop: [];
  'choose-root': [];
  'remove-root': [rootId: string];
  'update-provider': [id: string];
  'open-settings': [];
  'update-model': [id: string];
  'update-mode': [mode: AgentMode];
}>();

const draft = ref('');
const skillOpen = ref(false);
const skillItems = ref<SkillSummary[]>([]);
const skillActiveIndex = ref(0);
const skillListRef = ref<HTMLElement | null>(null);
let skillRequest = 0;
const inputRef = ref<InputInst | null>(null);
const placeholder = computed(() => t('chat.composerPlaceholder'));

/**
 * 输入 / 时展示 Skill；选中后由 Agent 以显式 Skill 方式激活。
 */
watch(draft, async (value) => {
  const match = /^\/([a-zA-Z0-9._-]*)$/.exec(value);
  if (!match) {
    skillOpen.value = false;
    return;
  }
  const query = (match[1] ?? '').toLowerCase();
  const request = ++skillRequest;
  try {
    const skills = await listSkills();
    if (request !== skillRequest) return;
    const filtered = skills
      .filter(
        (skill) =>
          !query ||
          skill.id.toLowerCase().includes(query) ||
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(query))
      )
      .sort((a, b) => {
        const aPrefix = a.id.toLowerCase().startsWith(query) ? 0 : 1;
        const bPrefix = b.id.toLowerCase().startsWith(query) ? 0 : 1;
        return aPrefix - bPrefix || a.id.localeCompare(b.id);
      });
    skillItems.value = filtered.slice(0, 8);
    skillActiveIndex.value = 0;
    skillOpen.value = skillItems.value.length > 0;
  } catch {
    if (request !== skillRequest) return;
    skillItems.value = [];
    skillOpen.value = false;
  }
});

const chooseSkill = (id: string): void => {
  draft.value = `/${id} `;
  skillOpen.value = false;
  inputRef.value?.focus();
};

const onComposerKeydown = (event: KeyboardEvent): void => {
  if (skillOpen.value && skillItems.value.length) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      skillActiveIndex.value = (skillActiveIndex.value + 1) % skillItems.value.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      skillActiveIndex.value =
        (skillActiveIndex.value - 1 + skillItems.value.length) % skillItems.value.length;
      return;
    }
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey) {
      event.preventDefault();
      const skill = skillItems.value[skillActiveIndex.value];
      if (skill) chooseSkill(skill.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      skillOpen.value = false;
      return;
    }
  }
  onKeydown(event);
};

watch(skillActiveIndex, async () => {
  await nextTick();
  const buttons = skillListRef.value?.querySelectorAll<HTMLElement>('.nh-composer__skill');
  buttons?.[skillActiveIndex.value]?.scrollIntoView({ block: 'nearest' });
});

const onInputBlur = (): void => {
  closeReferences();
  skillOpen.value = false;
};
const { selectedReferences, addReference, removeReference, send } = useComposerReferences({
  draft,
  sessionId: computed(() => props.sessionId),
  disabled: computed(() => props.disabled),
  running: computed(() => props.running),
  send: (prompt, imagePaths, references) => emit('send', prompt, imagePaths, references)
});

/**
 * 关闭候选列表后提交消息。
 */
const submit = (): void => {
  closeReferences();
  send();
};

/**
 * 输入框内 Tab 切换 Plan/Build；带修饰键或运行中保留原生焦点导航。
 */
const onTab = (event: KeyboardEvent): void => {
  if (
    event.isComposing ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    props.running
  ) {
    return;
  }
  event.preventDefault();
  emit('update-mode', props.mode === 'plan' ? 'build' : 'plan');
};

const {
  references,
  activeIndex,
  searching,
  open: referenceOpen,
  close: closeReferences,
  select: selectReference,
  onKeydown
} = useFileReference({
  draft,
  sessionId: toRef(props, 'sessionId'),
  disabled: computed(() => props.disabled),
  running: computed(() => props.running),
  enabled: computed(() => props.roots.length > 0),
  inputRef,
  formatReference: () => '',
  onSelect: addReference,
  submit,
  toggleMode: onTab
});
</script>

<style scoped lang="less">
.nh-composer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  width: calc(100% - 64px);
  max-width: 1040px;
  margin: 0 auto 24px;
  padding: 10px 12px 8px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 16px;
  background: var(--nh-surface-base);
  box-shadow: var(--nh-shadow-card);
  transition:
    border-color var(--nh-duration-fast) var(--nh-ease-standard),
    box-shadow var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-composer:focus-within {
  border-color: color-mix(in srgb, var(--nh-color-accent) 45%, var(--nh-border-subtle));
  box-shadow:
    var(--nh-shadow-card),
    0 0 0 3px color-mix(in srgb, var(--nh-color-accent) 8%, transparent);
}

.nh-composer--hero {
  padding: 14px 16px 10px;
  border-radius: 16px;
  box-shadow: var(--nh-shadow-float);
}

.nh-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--nh-border-subtle);
}

.nh-composer__toolbar-right {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.nh-composer__skills {
  display: flex;
  max-height: 280px;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px;
}

.nh-composer__skills-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 7px 6px;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-composer__skills-count {
  color: var(--nh-color-text-disabled);
  font-family: var(--nh-font-mono);
  font-size: 10px;
}

.nh-composer__skill {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--nh-color-text-primary);
  text-align: left;
  cursor: pointer;
  transition: background var(--nh-duration-fast) var(--nh-ease-standard);
}

.nh-composer__skill:hover {
  background: var(--nh-color-bg-hover);
}

.nh-composer__skill--active,
.nh-composer__skill--active:hover {
  background: color-mix(in srgb, var(--nh-color-accent) 10%, transparent);
}

.nh-composer__skill-icon {
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--nh-color-bg-hover);
  color: var(--nh-color-text-secondary);
}

.nh-composer__skill--active .nh-composer__skill-icon {
  background: color-mix(in srgb, var(--nh-color-accent) 14%, transparent);
  color: var(--nh-color-accent);
}

.nh-composer__skill-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.nh-composer__skill-name {
  overflow: hidden;
  font-family: var(--nh-font-mono);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nh-composer__skill-description {
  overflow: hidden;
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
