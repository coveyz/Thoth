import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { streamChat } from '@/api/apiStream';
import type { ChatMessage, ChatTurnTrace, SSEDone, SSEError, SSEStart, SSEToolCall, SSEToolError, SSEToolResult, ToolChoice } from '@/types/chat';

type Status = 'idle' | 'streaming' | 'stopping' | 'error';

type NewToolEvent =
  | { type: 'tool_call', payload: SSEToolCall }
  | { type: 'tool_result', payload: SSEToolResult }
  | { type: 'tool_error', payload: SSEToolError };


const makeId = () => {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2, 10)
};

export const useChatStore = defineStore('chat', () => {
  /** 聊天正文  仍然只放 user / assistant */
  const messages = ref<ChatMessage[]>([]);
  /** 每轮请求的工具轨迹 */
  const turns = ref<ChatTurnTrace[]>([]);

  const status = ref<Status>('idle');
  const errorText = ref<string>('');

  // week1： 单会话 week2 再拓展多会话列表
  const conversationId = ref('default');

  /**
   * week1: 随便指定模型
   * week2: 这里会变成“可选模型列表 + 当前选中模型”，真正实现切大模型。
   */
  const model = ref('');

  const toolChoice = ref<ToolChoice>('auto');
  const controller = ref<AbortController | null>(null);
  const activeTurnId = ref<string | null>(null);

  const isBusy = computed(() => status.value === 'streaming' || status.value === 'stopping');
  const canSend = computed(() => status.value === 'idle' || status.value === 'error');

  // 当前活跃的请求轮次， 用于在顶部状态栏展示 requestId / model / toolChoice
  const activeTurn = computed(() => {
    return turns.value.find((item) => item.id === activeTurnId.value) ?? null;
  });
  const activeRequestId = computed(() => {
    return activeTurn.value?.requestId ?? 'pending';
  })
  const activeModel = computed(() => {
    return activeTurn.value?.model ?? 'pending';
  })

  /** 用户消息 放进聊天正文  */
  const pushUser = (content: string) => {
    messages.value.push({ id: makeId(), role: 'user', content });
  };

  /** 确保最后一条消息是 assistant， 没有则添加一个空的 */
  const ensureAssistant = () => {
    const last = messages.value[messages.value.length - 1];
    if (!last || last.role !== 'assistant') {
      messages.value.push({ id: makeId(), role: 'assistant', content: '' });
    };
  };

  /** 追加增量内容到最后一条 assistant 消息， 增量追加 */
  const appendAssistantDelta = (delta: string) => {
    ensureAssistant();
    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage) {
      lastMessage.content += delta;
    };
  };

  /** 新建一轮 trace， 新一轮用户输入， 工具策略，后续工具事件都归到这里 */
  const createTurn = (userText: string) => {
    const turn: ChatTurnTrace = {
      id: makeId(),
      userText,
      toolChoice: toolChoice.value,
      createdAt: Date.now(),
      outcome: 'pending',
      events: []
    }

    turns.value.push(turn);
    activeTurnId.value = turn.id;

    return turn;
  };

  const updateActiveTurn = (
    updater: (turn: ChatTurnTrace) => void
  ) => {
    const turn = activeTurn.value;
    if (!turn) return;
    updater(turn);
  };

  /** 工具追加到当前轮次， 在这补充 id 时间戳，组件只负责渲染 */
  const pushTurnEvent = (event: NewToolEvent) => {
    updateActiveTurn(turn => {
      const nextEvent = {
        id: makeId(),
        createdAt: Date.now(),
        ...event
      };

      turn.events.push(nextEvent);
    });
  }

  /** 更新 requestId model */
  const markStarted = (payload: SSEStart) => {
    updateActiveTurn(turn => {
      turn.requestId = payload.requestId;
      turn.model = payload.model;
    })
  };

  const markDone = (payload: SSEDone) => {
    updateActiveTurn(turn => {
      turn.outcome = payload.reason === 'stop' ? 'stopped' : 'done';
      turn.doneReason = payload.reason;
    })
  };

  const markError = (text: string) => {
    updateActiveTurn(turn => {
      turn.outcome = 'error';
      turn.errorText = text;
    })
  }

  const setToolChoice = (value: ToolChoice) => {
    toolChoice.value = value;
  }

  const send = async (text: string) => {
    const content = text.trim();
    if (!content) return;
    if (!canSend.value) return;

    errorText.value = '';
    status.value = 'streaming';

    pushUser(content);
    createTurn(content);
    ensureAssistant();

    controller.value = new AbortController();
    let startInfo: SSEStart | null = null;
    try {
      await streamChat({
        message: content,
        model: model.value || undefined,
        toolChoice: toolChoice.value,
        signal: controller.value.signal,
        callbacks: {
          onStart: (payload) => {
            startInfo = payload
            markStarted(payload);
          },
          onToolCall: (payload) => {
            pushTurnEvent({ type: 'tool_call', payload });
          },
          /**  */
          onToolResult: (payload) => {
            pushTurnEvent({ type: 'tool_result', payload });
          },
          onToolError: (payload) => {
            pushTurnEvent({ type: 'tool_error', payload });
          },
          onDelta: (delta) => appendAssistantDelta(delta),
          onError: (error: SSEError) => {
            status.value = 'error'
            errorText.value = `${error.code}: ${error.message} ${startInfo?.requestId ? startInfo.requestId : ''}`
            markError(errorText.value);
          },
          onDone: (payload) => {
            markDone(payload)
            if (status.value !== 'error') status.value = 'idle';
          }
        }
      })

      // 兜底： 流结束但没 done
      if (status.value === 'streaming') {
        markDone({ ok: true });
        status.value = 'idle';
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        status.value = 'idle';
        markDone({ ok: true, reason: 'stop' })
      } else {
        status.value = 'error';
        errorText.value = error?.message ?? String(error);
        markError(errorText.value);
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
    turns,
    status,
    errorText,
    conversationId,
    model,
    toolChoice,
    activeTurn,
    activeRequestId,
    activeModel,
    isBusy,
    canSend,
    setToolChoice,
    send,
    stop,
    clearError,
  };
})
