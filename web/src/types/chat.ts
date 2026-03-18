/*
 * @Author: coveyz zhangkairong123@qq.com
 * @Date: 2026-03-13 16:59:22
 * @LastEditors: coveyz zhangkairong123@qq.com
 * @LastEditTime: 2026-03-13 18:12:01
 * @FilePath: /Thoth/web/src/types/chat.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

export type SSEEventName = 'start' | 'delta' | 'ping' | 'done' | 'error';

export type SSEStart = { requestId: string; model: string; };
export type SSEPing = { t: number; };
export type SSEDone = { ok: true; reason?: 'stop' };
export type SSEError = { code: string; message: string; requestId?: string; };

export type Role = 'user' | 'assistant';
export type ChatMessage = { id: string; role: Role; content: string; };
