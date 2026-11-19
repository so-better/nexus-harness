<template>
  <div ref="container" class="nh-terminal-view" />
</template>

<script setup lang="ts">
/**
 * 单个 xterm 实例：显示 PTY 输出并把用户输入写回主进程。
 */

import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../stores/terminal.store';
import { TERMINAL_COLORS } from '../terminal-theme';

const props = defineProps<{ tab: TerminalSessionPublic; active: boolean }>();
const store = useTerminalStore();
const container = ref<HTMLElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let resizeObserver: ResizeObserver | undefined;
let inputDisposable: { dispose: () => void } | undefined;
let inputBuffer = '';
let inputTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 按容器尺寸调整 PTY，并同步到主进程。
 */
const fit = (): void => {
  if (!terminal || !fitAddon || !container.value) return;
  if (container.value.clientWidth <= 0 || container.value.clientHeight <= 0) return;
  fitAddon.fit();
  const cols = terminal.cols;
  const rows = terminal.rows;
  if (cols > 1 && rows > 0) store.resize(props.tab.id, cols, rows).catch(() => undefined);
};

onMounted(() => {
  if (!container.value) return;
  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: '"SF Mono", "Cascadia Code", ui-monospace, monospace',
    fontSize: 12,
    lineHeight: 1.3,
    scrollback: 5000,
    theme: {
      background: TERMINAL_COLORS.background,
      foreground: TERMINAL_COLORS.text,
      cursor: TERMINAL_COLORS.accent,
      cursorAccent: TERMINAL_COLORS.background,
      selectionBackground: TERMINAL_COLORS.selection,
      black: TERMINAL_COLORS.surface,
      red: TERMINAL_COLORS.danger,
      green: TERMINAL_COLORS.success,
      yellow: TERMINAL_COLORS.warning,
      blue: TERMINAL_COLORS.accent,
      magenta: TERMINAL_COLORS.magenta,
      cyan: TERMINAL_COLORS.cyan,
      white: TERMINAL_COLORS.text,
      brightBlack: TERMINAL_COLORS.disabled,
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fde68a',
      brightBlue: TERMINAL_COLORS.accentHover,
      brightMagenta: '#d8d2ff',
      brightCyan: '#a5f0fc',
      brightWhite: '#ffffff'
    }
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container.value);
  let written = 0;
  const flush = (): void => {
    const output = store.outputs[props.tab.id] ?? '';
    if (output.length > written) {
      terminal?.write(output.slice(written));
      written = output.length;
    } else if (output.length < written) {
      terminal?.reset();
      terminal?.write(output);
      written = output.length;
    }
    if (props.tab.status === 'exited' && !container.value?.dataset.exited) {
      container.value!.dataset.exited = '1';
      terminal?.write('\r\n\x1b[2m[进程已退出]\x1b[0m\r\n');
    }
  };
  flush();
  watch(() => store.outputs[props.tab.id], flush);
  watch(() => props.tab.status, flush);
  inputDisposable = terminal.onData((data) => {
    inputBuffer += data;
    if (inputBuffer.length >= 8_192) {
      flushInput();
      return;
    }
    if (inputTimer === undefined) {
      inputTimer = setTimeout(flushInput, 8);
    }
  });
  resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(container.value);
  requestAnimationFrame(fit);
});

watch(
  () => props.active,
  (active) => {
    if (!active) return;
    nextTick(() => {
      fit();
      terminal?.focus();
    });
  }
);

const flushInput = (): void => {
  if (inputTimer !== undefined) clearTimeout(inputTimer);
  inputTimer = undefined;
  if (!inputBuffer) return;
  const data = inputBuffer;
  inputBuffer = '';
  store.write(props.tab.id, data).catch(() => undefined);
};

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  inputDisposable?.dispose();
  if (inputTimer !== undefined) clearTimeout(inputTimer);
  terminal?.dispose();
  terminal = undefined;
});
</script>

<style scoped lang="less">
.nh-terminal-view {
  width: 100%;
  height: 100%;
  padding: 8px 10px;
  background: var(--terminal-bg);
}

.nh-terminal-view :deep(.xterm) {
  height: 100%;
}

.nh-terminal-view :deep(.xterm-viewport) {
  background: var(--terminal-bg);
}
</style>
