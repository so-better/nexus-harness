/**
 * 助手消息流式追帧：把增量内容平滑追平到目标文本。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ChatMessageView } from './types';
import { isAssistantTyping } from './agent-generation';

export const useMessageStreaming = (getMessage: () => ChatMessageView, onGrowth: () => void) => {
  const visibleContent = ref(getMessage().content);
  let frameId: number | undefined;

  /**
   * 逐帧追平目标内容；完成时仍把剩余尾巴打完，避免整段突然跳出。
   */
  const pump = (): void => {
    frameId = undefined;
    if (getMessage().role !== 'assistant') {
      visibleContent.value = getMessage().content;
      return;
    }

    const target = Array.from(getMessage().content);
    const visible = Array.from(visibleContent.value);
    if (visible.length >= target.length) {
      if (visibleContent.value !== getMessage().content) {
        visibleContent.value = getMessage().content;
      }
      return;
    }

    const remaining = target.length - visible.length;
    const step = Math.max(1, Math.ceil(remaining / 16));
    visibleContent.value = target.slice(0, visible.length + step).join('');
    onGrowth();
    frameId = requestAnimationFrame(pump);
  };

  /**
   * 启动追帧；已有帧时不重复调度。
   */
  const start = (): void => {
    if (!getMessage().streaming || getMessage().timeline?.length) {
      visibleContent.value = getMessage().content;
      return;
    }
    if (frameId === undefined) frameId = requestAnimationFrame(pump);
  };

  watch(
    () => getMessage().content,
    () => {
      if (getMessage().role !== 'assistant' || !getMessage().streaming) {
        visibleContent.value = getMessage().content;
        return;
      }
      start();
    }
  );

  watch(
    () => getMessage().streaming,
    (streaming) => {
      if (getMessage().role !== 'assistant') return;
      if (!streaming) {
        if (frameId !== undefined) {
          cancelAnimationFrame(frameId);
          frameId = undefined;
        }
        visibleContent.value = getMessage().content;
        return;
      }
      start();
    }
  );

  onMounted(() => {
    if (getMessage().role === 'assistant') start();
  });

  onBeforeUnmount(() => {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
  });

  const contentText = computed(() =>
    getMessage().role === 'assistant' ? visibleContent.value : getMessage().content
  );
  const isTyping = computed(() =>
    isAssistantTyping({
      role: getMessage().role,
      streaming: getMessage().streaming === true,
      hasTimeline: Boolean(getMessage().timeline?.length),
      visibleContent: visibleContent.value,
      content: getMessage().content
    })
  );

  return { contentText, isTyping };
};
