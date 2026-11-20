<template>
  <div ref="root" class="nh-markdown" :class="{ 'is-streaming': streaming }" @click="handleClick" />
</template>

<script setup lang="ts">
/**
 * Markdown 内容：安全 HTML、公式、代码高亮与复制。
 */

import { onMounted, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import { renderMarkdown } from './markdown';

const props = defineProps<{
  content: string;
  streaming?: boolean;
}>();

const root = ref<HTMLElement>();
const message = useMessage();

const apply = (): void => {
  if (root.value) root.value.innerHTML = renderMarkdown(props.content);
};

watch(() => props.content, apply);
onMounted(apply);

const handleClick = async (event: MouseEvent): Promise<void> => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.md-code-copy');
  if (!button) return;
  const code = button.closest('.md-code-block')?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent ?? '');
    button.textContent = t('chat.copied');
    window.setTimeout(() => {
      button.textContent = t('chat.copy');
    }, 1500);
  } catch {
    message.error(t('chat.copyFailed'));
  }
};
</script>

<style lang="less">
.nh-markdown {
  min-width: 0;
  color: var(--nh-color-text-primary);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.nh-markdown h1,
.nh-markdown h2,
.nh-markdown h3,
.nh-markdown h4 {
  margin: 14px 0 8px;
  font-weight: 600;
  line-height: 1.35;
}

.nh-markdown h1 {
  font-size: 20px;
}

.nh-markdown h2 {
  font-size: 17px;
}

.nh-markdown h3 {
  font-size: 15px;
}

.nh-markdown p {
  margin: 0 0 10px;
}

.nh-markdown ul,
.nh-markdown ol {
  margin: 6px 0 12px;
  padding-left: 22px;
}

.nh-markdown li {
  margin: 3px 0;
}

.nh-markdown blockquote {
  margin: 10px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--nh-color-accent);
  color: var(--nh-color-text-secondary);
  background: color-mix(in srgb, var(--nh-surface-elevated) 65%, transparent);
}

.nh-markdown a {
  color: var(--nh-color-accent);
  text-decoration: none;
}

.nh-markdown a:hover {
  text-decoration: underline;
}

.nh-markdown code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--nh-color-bg-hover);
  font-family: var(--nh-font-mono);
  font-size: 0.92em;
}

.nh-markdown table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 10px 0;
}

.nh-markdown th,
.nh-markdown td {
  padding: 6px 10px;
  border: 1px solid var(--nh-border-subtle);
  text-align: left;
}

.nh-markdown th {
  background: var(--nh-surface-elevated);
  font-weight: 600;
}

.nh-markdown img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.nh-markdown video {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 8px;
  background: var(--nh-color-code-bg);
}

.nh-markdown figure {
  margin: 10px 0;
}

.nh-markdown figcaption {
  margin-top: 6px;
  color: var(--nh-color-text-secondary);
  font-size: 12px;
}

.nh-markdown .katex-display {
  margin: 12px 0;
  overflow: hidden auto;
}

.nh-markdown .md-code-block {
  position: relative;
  margin: 10px 0;
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 9px;
  background: var(--nh-surface-elevated);
}

.nh-markdown .md-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--nh-border-subtle);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
}

.nh-markdown .md-code-head button {
  padding: 3px 7px;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 5px;
  background: var(--nh-surface-base);
  color: var(--nh-color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.nh-markdown .md-code-block pre {
  margin: 0;
  padding: 14px 16px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
}

.nh-markdown .md-code-block code {
  padding: 0;
  background: transparent;
}

.nh-markdown .hljs {
  color: var(--nh-color-text-primary);
  background: transparent;
}

.nh-markdown .hljs-comment,
.nh-markdown .hljs-quote {
  color: var(--nh-color-text-secondary);
  font-style: italic;
}

.nh-markdown .hljs-keyword,
.nh-markdown .hljs-selector-tag,
.nh-markdown .hljs-literal {
  color: var(--nh-color-accent);
}

.nh-markdown .hljs-string,
.nh-markdown .hljs-attr,
.nh-markdown .hljs-template-tag {
  color: var(--nh-color-success);
}

.nh-markdown .hljs-number,
.nh-markdown .hljs-symbol {
  color: var(--nh-color-warning);
}

.nh-markdown .hljs-title,
.nh-markdown .hljs-section,
.nh-markdown .hljs-function {
  color: var(--nh-color-idle);
}

.nh-markdown.is-streaming > :last-child::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background: var(--nh-color-accent);
  vertical-align: -0.12em;
  animation: nh-markdown-caret 1s steps(2, start) infinite;
}

@keyframes nh-markdown-caret {
  50% {
    opacity: 0;
  }
}
</style>
