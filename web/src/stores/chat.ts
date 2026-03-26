/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-12 20:48:52
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-26 17:56:26
 * @FilePath: /Thoth/web/src/stores/chat.ts
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { streamChat } from '@/api/apiStream';
import type { ChatMessage, SSEError, SSEStart } from '@/types/chat';

type Status = 'idle' | 'streaming' | 'stopping' | 'error';


const makeId = () => {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2, 10)
};

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const status = ref<Status>('idle');
  const errorText = ref<string>('');

  // week1： 单会话 week2 再拓展多会话列表
  const conversationId = ref('default');

  /**
   * week1: 随便指定模型
   * week2: 这里会变成“可选模型列表 + 当前选中模型”，真正实现切大模型。
   */
  const model = ref('');

  const controller = ref<AbortController | null>(null);

  const isBusy = computed(() => status.value === 'streaming' || status.value === 'stopping');
  const canSend = computed(() => status.value === 'idle' || status.value === 'error');

  const pushUser = (content: string) => {
    messages.value.push({ id: makeId(), role: 'user', content });
  };

  // 确保最后一条消息是 assistant， 没有则添加一个空的
  const ensureAssistant = () => {
    const last = messages.value[messages.value.length - 1];
    if (!last || last.role !== 'assistant') {
      messages.value.push({ id: makeId(), role: 'assistant', content: '' });
    };
  };

  // 追加增量内容到最后一条 assistant 消息
  const appendAssistantDelta = (delta: string) => {
    ensureAssistant();
    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage) {
      lastMessage.content += delta;
    };
  };

  const send = async (text: string) => {
    const content = text.trim();
    if (!content) return;
    if (!canSend.value) return;

    errorText.value = '';
    status.value = 'streaming';

    // 体验： 先显示信息 再开始请求， 避免网络请求慢导致的无响应感
    pushUser(content);
    ensureAssistant();

    controller.value = new AbortController();
    let startInfo: SSEStart | null = null;

    try {
      await streamChat({
        message: content,
        model: model.value || undefined,
        signal: controller.value.signal,
        callbacks: {
          onStart: (p) => (startInfo = p),
          onDelta: (delta) => appendAssistantDelta(delta),
          onError: (error: SSEError) => {
            status.value = 'error'
            errorText.value = `${error.code}: ${error.message} ${startInfo?.requestId ? startInfo.requestId : ''}`
          },
          onDone: () => {
            if (status.value !== 'error') status.value = 'idle';
          }
        }
      })

      // 兜底： 流结束但没 done
      if (status.value === 'streaming') status.value = 'idle';
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        status.value = 'idle';
      } else {
        status.value = 'error';
        errorText.value = error?.message ?? String(error);
      };
    } finally {
      controller.value = null;
    };

  };

  const stop = () => {
    if (!controller.value) return;
    if (status.value !== 'streaming') return;

    status.value = 'stopping';
    controller.value.abort();

    queueMicrotask(() => {
      if (status.value === 'stopping') status.value = 'idle';
    });
  };

  const clearError = () => {
    errorText.value = '';
    if (status.value === 'error') status.value = 'idle';
  };

  return {
    messages,
    status,
    errorText,
    conversationId,
    model,
    isBusy,
    canSend,
    send,
    stop,
    clearError,
  };
})
