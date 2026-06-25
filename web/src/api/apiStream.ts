import type {
  SSEStart, SSEPing, SSEDone, SSEError, SSEToolCall, SSEToolError, SSEToolResult, ToolChoice,
} from '@/types/chat';

type StreamCallbacks = {
  onStart?: (p: SSEStart) => void;
  onDelta?: (delta: string) => void;
  onPing?: (p: SSEPing) => void;
  onDone?: (p: SSEDone) => void;
  onError?: (p: SSEError) => void;
  /** 记录工具调用 */
  onToolCall?: (p: SSEToolCall) => void
  /** 记录工具结果 */
  onToolResult?: (p: SSEToolResult) => void
  /** 记录工具错误 */
  onToolError?: (p: SSEToolError) => void
};

/**
 * Streams chat messages from the server.
 * SSE协议封装， UI/Store只关心回调
 */
export const streamChat = async (args: {
  message: string,
  model?: string,
  toolChoice?: ToolChoice,
  signal: AbortSignal,
  callbacks: StreamCallbacks,
}) => {
  const { message, model, toolChoice, signal, callbacks } = args;

  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, model, toolChoice }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    callbacks.onError?.({ code: `HTTP_${resp.status}`, message: text || `HTTP ${resp.status}` });
    return;
  };

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE event block 空行分割 \n\n
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawBlock = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let eventName: string | null = null;
      const dataLines: string[] = [];

      for (const line of rawBlock.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      };

      if (!eventName) continue;
      const dataRaw = dataLines.join('\n');

      // delta 纯文本增量， 不走 JSON.parse
      if (eventName === 'delta') {
        callbacks.onDelta?.(dataRaw);
        continue;
      };

      try {
        const obj = JSON.parse(dataRaw);
        if (eventName === 'start') callbacks.onStart?.(obj);
        if (eventName === 'tool_call') callbacks.onToolCall?.(obj);
        if (eventName === 'tool_result') callbacks.onToolResult?.(obj);
        if (eventName === 'tool_error') callbacks.onToolError?.(obj);
        if (eventName === 'ping') callbacks.onPing?.(obj);
        if (eventName === 'done') callbacks.onDone?.(obj);
        if (eventName === 'error') callbacks.onError?.(obj);
      } catch (error) {
        callbacks.onError?.({
          code: 'BAD_EVENT',
          message: `Bad payload for event: ${eventName}`,
        })
      }
    }
  };
}
