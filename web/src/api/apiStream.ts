/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-12 20:49:01
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-16 20:53:17
 * @FilePath: /Thoth/web/src/api/apiStream.ts
 */
import type { SSEStart, SSEPing, SSEDone, SSEError } from '@/types/chat';

type StreamCallbacks = {
  onStart?: (p: SSEStart) => void;
  onDelta?: (delta: string) => void;
  onPing?: (p: SSEPing) => void;
  onDone?: (p: SSEDone) => void;
  onError?: (p: SSEError) => void;
};

/**
 * Streams chat messages from the server.
 * SSE协议封装， UI/Store只关心回调
 */
export const streamChat = async (args: {
  message: string,
  model?: string,
  signal: AbortSignal,
  callbacks: StreamCallbacks,
}) => {
  const { message, model, signal, callbacks } = args;

  const resp = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, model }),
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

      if (eventName === 'delta') {
        callbacks.onDelta?.(dataRaw);
        continue;
      };

      try {
        const obj = JSON.parse(dataRaw);
        if (eventName === 'start') callbacks.onStart?.(obj);
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
