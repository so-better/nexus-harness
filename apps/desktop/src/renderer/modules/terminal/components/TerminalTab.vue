<template>
  <div class="nh-terminal-shell">
    <div
      ref="container"
      class="nh-terminal-view"
      @contextmenu.prevent.stop="emit('contextmenu', $event)"
      @dragover.prevent
      @drop.prevent="onDrop"
    />
    <div v-if="pendingPaste" class="nh-terminal-paste-confirm">
      <p>{{ t('terminal.pasteConfirm') }} ({{ pendingPasteLines }})</p>
      <div class="nh-terminal-paste-confirm__actions">
        <NButton size="small" secondary @click="cancelPaste">
          {{ t('chat.askUserCancel') }}
        </NButton>
        <NButton size="small" type="primary" @click="confirmPaste">
          {{ t('terminal.paste') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 单个 xterm 实例：显示 PTY 输出并把用户输入写回主进程。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import type { TerminalSessionPublic } from '@shared/ipc/contracts';
import { NButton, useMessage } from 'naive-ui';
import { t } from '@/app/i18n';
import {
  getPathForFile,
  openExternal,
  openPath,
  readTerminalClipboard,
  writeTerminalClipboard
} from '../api/terminal.api';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../stores/terminal.store';
import { findTerminalPathMatches } from '../terminal-path-links';
import { TERMINAL_COLORS, TERMINAL_FONT_FAMILY } from '../terminal-theme';

const props = defineProps<{ tab: TerminalSessionPublic; active: boolean }>();
const emit = defineEmits<{ search: []; contextmenu: [event: MouseEvent] }>();
const store = useTerminalStore();
const pendingPaste = ref<string>();
const message = useMessage();
const pendingPasteLines = computed(() => pendingPaste.value?.split(/\r\n|\r|\n/).length ?? 0);
const container = ref<HTMLElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let searchAddon: SearchAddon | undefined;
let webglAddon: WebglAddon | undefined;
let unregisterController: (() => void) | undefined;
let selectionTimer: ReturnType<typeof setTimeout> | undefined;
let resizeObserver: ResizeObserver | undefined;
let inputDisposable: { dispose: () => void } | undefined;
let selectionDisposable: { dispose: () => void } | undefined;
let inputBuffer = '';
let inputTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 应用终端外观设置。
 */
const applySettings = (): void => {
  if (!terminal) return;
  terminal.options.fontFamily = TERMINAL_FONT_FAMILY;
  terminal.options.fontSize = store.settings.fontSize;
  terminal.options.scrollback = store.settings.scrollback;
  applyWebgl();
};

/**
 * 仅活动标签启用 WebGL，避免多终端占用 GPU 上下文。
 */
const applyWebgl = (): void => {
  if (!terminal) return;
  if (!store.settings.webgl || !props.active) {
    webglAddon?.dispose();
    webglAddon = undefined;
    return;
  }
  if (webglAddon) return;
  try {
    webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
      webglAddon?.dispose();
      webglAddon = undefined;
    });
    terminal.loadAddon(webglAddon);
  } catch {
    webglAddon = undefined;
  }
};

/**
 * 处理多行粘贴确认后写入终端。
 */
const pasteText = async (text: string): Promise<void> => {
  if (!text || !terminal) return;
  const lines = text.split(/\r\n|\r|\n/).length;
  if (lines <= 1) {
    terminal.paste(text);
    terminal.focus();
    return;
  }
  pendingPaste.value = text;
};

const confirmPaste = (): void => {
  if (!pendingPaste.value) return;
  terminal?.paste(pendingPaste.value);
  pendingPaste.value = undefined;
  terminal?.focus();
};

const cancelPaste = (): void => {
  pendingPaste.value = undefined;
  terminal?.focus();
};

const showCopyNotice = (): void => {
  message.success(t('chat.copied'), { duration: 1_200 });
};

/**
 * 把拖入的文件路径转成 shell 参数写入终端。
 */
const onDrop = (event: DragEvent): void => {
  if (!terminal || !event.dataTransfer) return;
  const paths: string[] = [];
  for (const file of Array.from(event.dataTransfer.files)) {
    try {
      const path = getPathForFile(file);
      if (path) paths.push(path);
    } catch {
      // 单个文件取路径失败时跳过
    }
  }
  if (!paths.length) return;
  const quoted = paths.map((path) =>
    navigator.userAgent.includes('Windows')
      ? `"${path.replace(/"/g, '""')}"`
      : `'${path.replace(/'/g, "'\\''")}'`
  );
  terminal.paste(quoted.join(' '));
  terminal.focus();
};

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
    fontFamily: TERMINAL_FONT_FAMILY,
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
      brightRed: TERMINAL_COLORS.brightRed,
      brightGreen: TERMINAL_COLORS.brightGreen,
      brightYellow: TERMINAL_COLORS.brightYellow,
      brightBlue: TERMINAL_COLORS.accentHover,
      brightMagenta: TERMINAL_COLORS.brightMagenta,
      brightCyan: TERMINAL_COLORS.brightCyan,
      brightWhite: TERMINAL_COLORS.brightWhite
    }
  });
  fitAddon = new FitAddon();
  searchAddon = new SearchAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(
    new WebLinksAddon((_event, uri) => {
      openExternal(uri).catch(() => undefined);
    })
  );
  terminal.open(container.value);
  applyWebgl();
  terminal.registerLinkProvider({
    provideLinks: (y, callback) => {
      const buffer = terminal?.buffer.active;
      if (!buffer) {
        callback(undefined);
        return;
      }
      let first = y - 1;
      while (first > 0 && buffer.getLine(first)?.isWrapped) first -= 1;
      const parts: Array<{ y: number; text: string }> = [];
      let cursor = first;
      while (cursor < buffer.length) {
        const line = buffer.getLine(cursor);
        if (!line) break;
        parts.push({ y: cursor + 1, text: line.translateToString(true) });
        const next = buffer.getLine(cursor + 1);
        if (!next?.isWrapped) break;
        cursor += 1;
      }
      const text = parts.map((part) => part.text).join('');
      const locate = (offset: number): { x: number; y: number } | null => {
        let consumed = 0;
        for (const part of parts) {
          if (offset < consumed + part.text.length) {
            return { x: offset - consumed + 1, y: part.y };
          }
          consumed += part.text.length;
        }
        return null;
      };
      const links = findTerminalPathMatches(text)
        .map((match) => {
          const start = locate(match.index);
          const end = locate(match.index + match.text.length - 1);
          if (!start || !end || start.y !== y) return undefined;
          return {
            range: { start, end },
            text: match.text,
            activate: () => {
              openPath(match.text).catch(() => undefined);
            }
          };
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link));
      callback(links.length ? links : undefined);
    }
  });
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    const key = event.key.toLowerCase();
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && key === 'k') {
      event.preventDefault();
      event.stopPropagation();
      terminal?.clear();
      return false;
    }
    const isCopy =
      (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && key === 'c') ||
      (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && key === 'c');
    if (isCopy && terminal?.hasSelection()) {
      event.preventDefault();
      event.stopPropagation();
      const selection = terminal.getSelection();
      if (selection) {
        writeTerminalClipboard(selection)
          .then((copied) => {
            if (copied) showCopyNotice();
          })
          .catch(() => undefined);
      }
      return false;
    }
    const isPaste =
      (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && key === 'v') ||
      (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && key === 'v');
    if (isPaste) {
      event.preventDefault();
      event.stopPropagation();
      readTerminalClipboard()
        .then(pasteText)
        .catch(() => undefined);
      return false;
    }
    return true;
  });
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
  selectionDisposable = terminal.onSelectionChange(() => {
    if (!store.settings.copyOnSelect) return;
    if (selectionTimer !== undefined) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = undefined;
      const selection = terminal?.getSelection() ?? '';
      if (selection.trim()) {
        writeTerminalClipboard(selection)
          .then((copied) => {
            if (copied) showCopyNotice();
          })
          .catch(() => undefined);
      }
    }, 180);
  });
  unregisterController = store.registerController(props.tab.id, {
    findNext: (term) => searchAddon?.findNext(term, { incremental: true }) ?? false,
    findPrevious: (term) => searchAddon?.findPrevious(term, { incremental: true }) ?? false,
    clearSearch: () => searchAddon?.clearDecorations(),
    copy: async () => {
      const selection = terminal?.getSelection() ?? '';
      if (!selection) return false;
      const copied = await writeTerminalClipboard(selection);
      if (copied) showCopyNotice();
      terminal?.clearSelection();
      return copied;
    },
    paste: async () => {
      const text = await readTerminalClipboard();
      await pasteText(text);
    },
    selectAll: () => terminal?.selectAll(),
    clear: () => terminal?.clear(),
    focus: () => terminal?.focus()
  });
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
  // 等字体加载完成后再 fit 一次，避免用回退字体算出的行列裁掉最后一行
  document.fonts?.ready.then(() => fit()).catch(() => undefined);
});

watch(
  () => props.active,
  (active) => {
    applyWebgl();
    if (!active) {
      searchAddon?.clearDecorations();
      return;
    }
    nextTick(() => {
      fit();
      terminal?.focus();
    });
  }
);

watch(
  () => [store.settings.fontSize, store.settings.scrollback, store.settings.webgl],
  () => {
    applySettings();
    nextTick(fit);
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
  selectionDisposable?.dispose();
  if (inputTimer !== undefined) clearTimeout(inputTimer);
  if (selectionTimer !== undefined) clearTimeout(selectionTimer);
  webglAddon?.dispose();
  unregisterController?.();
  terminal?.dispose();
  terminal = undefined;
});
</script>

<style scoped lang="less">
.nh-terminal-shell {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 8px 10px;
  background: var(--terminal-bg);
}

.nh-terminal-view {
  width: 100%;
  height: 100%;
  background: var(--terminal-bg);
}

.nh-terminal-paste-confirm {
  position: absolute;
  z-index: 30;
  right: 14px;
  bottom: 14px;
  width: min(360px, calc(100% - 28px));
  padding: 12px;
  border: 1px solid var(--terminal-border);
  border-radius: 10px;
  background: var(--terminal-surface);
  box-shadow: var(--nh-shadow-popover);
  color: var(--terminal-text);
  font-size: 12px;
}

.nh-terminal-paste-confirm p {
  margin: 0 0 10px;
}

.nh-terminal-paste-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.nh-terminal-view :deep(.xterm) {
  height: 100%;
}

.nh-terminal-view :deep(.xterm-viewport) {
  background: var(--terminal-bg);
}
</style>
