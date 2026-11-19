<template>
  <div ref="container" class="nh-monaco-editor" :style="{ height }" />
</template>

<script setup lang="ts">
/**
 * 通用 Monaco 编辑器：v-model 双向绑定，语言通过 language 属性传入。
 */

import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

export type MonacoLanguage =
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'markdown'
  | 'plaintext'
  | 'css'
  | 'scss'
  | 'less'
  | 'html'
  | 'xml'
  | 'yaml'
  | 'python'
  | 'shell'
  | 'sql'
  | 'go'
  | 'rust'
  | 'java'
  | 'cpp';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: MonacoLanguage;
    height?: string;
    readonly?: boolean;
  }>(),
  {
    language: 'plaintext',
    height: '320px',
    readonly: false
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const container = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let themeObserver: MutationObserver | undefined;

/**
 * 按文件类型选择 Worker；未知语言回退到通用编辑器 Worker。
 */
(
  self as unknown as { MonacoEnvironment?: { getWorker: (_id: string, label: string) => Worker } }
).MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

/**
 * 把宿主语义色映射为 Monaco 主题，保证与深浅主题一致。
 */
const applyTheme = (): void => {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme === 'dark';
  const bg = read('--nh-color-bg-base', dark ? '#090d13' : '#ffffff');
  const elevated = read('--nh-color-bg-elevated', dark ? '#101720' : '#fbfcfe');
  const hover = read('--nh-color-bg-hover', dark ? '#172233' : '#f1f6fc');
  const text = read('--nh-color-text-primary', dark ? '#f3f7ff' : '#111827');
  const muted = read('--nh-color-text-secondary', dark ? '#93a4bd' : '#5b6472');
  const disabled = read('--nh-color-text-disabled', dark ? '#5b6a80' : '#9ca3af');
  const border = read('--nh-color-border', dark ? '#243246' : '#e6ebf2');
  const accent = read('--nh-color-accent', dark ? '#7fb6ff' : '#3b82f6');
  const idle = read('--nh-color-idle', dark ? '#b6afff' : '#6b63c9');
  const success = read('--nh-color-success', dark ? '#4ade80' : '#15803d');
  const warning = read('--nh-color-warning', dark ? '#fbbf24' : '#b45309');
  const name = `nexus-${dark ? 'dark' : 'light'}`;
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: muted, fontStyle: 'italic' },
      { token: 'keyword', foreground: accent },
      { token: 'string', foreground: success },
      { token: 'string.key.json', foreground: accent },
      { token: 'number', foreground: warning },
      { token: 'type', foreground: idle },
      { token: 'delimiter', foreground: muted },
      { token: 'operator', foreground: muted }
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editorCursor.foreground': accent,
      'editorLineNumber.foreground': disabled,
      'editorLineNumber.activeForeground': muted,
      'editor.selectionBackground': `${accent}33`,
      'editor.inactiveSelectionBackground': `${accent}1a`,
      'editor.lineHighlightBackground': hover,
      'editorIndentGuide.background1': border,
      'editorIndentGuide.activeBackground1': muted,
      'editorWidget.background': elevated,
      'editorWidget.border': border,
      'editorSuggestWidget.background': elevated,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.selectedBackground': hover,
      'editorHoverWidget.background': elevated,
      'editorHoverWidget.border': border,
      'editorGutter.background': bg,
      'scrollbarSlider.background': `${disabled}33`,
      'scrollbarSlider.hoverBackground': `${disabled}55`,
      'scrollbarSlider.activeBackground': `${disabled}77`
    }
  });
  monaco.editor.setTheme(name);
};

onMounted(() => {
  if (!container.value) return;
  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    readOnly: props.readonly,
    automaticLayout: true,
    minimap: { enabled: false },
    // 编辑器滚到边界后允许滚轮继续传递给弹窗或页面
    scrollbar: { alwaysConsumeMouseWheel: false },
    fontFamily:
      getComputedStyle(document.documentElement).getPropertyValue('--nh-font-mono').trim() ||
      'SF Mono, ui-monospace, monospace',
    fontSize: 12,
    lineHeight: 20,
    tabSize: 2,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    padding: { top: 10, bottom: 10 },
    ariaLabel: '代码编辑器'
  });
  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() ?? '';
    if (value !== props.modelValue) emit('update:modelValue', value);
  });
  applyTheme();
  themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }
);

watch(
  () => props.language,
  (language) => {
    const model = editor?.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }
);

watch(
  () => props.readonly,
  (readonly) => editor?.updateOptions({ readOnly: readonly })
);

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.dispose();
  editor = undefined;
});
</script>

<style scoped lang="less">
.nh-monaco-editor {
  min-height: 120px;
  overflow: hidden;
  border: 1px solid var(--nh-border-subtle);
  border-radius: 8px;
}
</style>
