import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createTestEnv } from './helpers/createTestEnv';
import { parseSSE, parseSSEJson } from './helpers/parseSSE';
import { createApp } from '../src/app';
import { embedTexts } from '../src/rag/embedding';


type SourcePayload = {
    sources: Array<{
        id: string;
        documentId: string;
        title: string;
        source: string;
        chunkIndex: number;
        content: string;
        score: number;
    }>
};

type DonePayload = {
    ok: boolean;
};


vi.mock('../src/rag/embedding.ts', () => {
    return {
        embedTexts: vi.fn(
            async (texts: string[]): Promise<number[][]> => {
                return texts.map((text) => {
                    // retrieveSources 计算文档向量时，输入由 title、source 和 content 拼接而成。
                    const isRagDocument = text.includes('Thoth 四周路线图')
                        || text.includes('Thoth Week2 验收说明');
                    if (isRagDocument) return [1, 0];
                    // 相关问题也返回 [1, 0]。
                    const isRelatedQuery = text.includes('Week3') ||
                        text.includes('sources');
                    if (isRelatedQuery) return [1, 0];
                    // 其他问题视为无关问题，返回 [0, 1]。
                    return [0, 1];
                })
            }
        )
    }
});

/**
 * 将所有 delta 的 data 拼成最终回答。
 * 生产端把回答拆成多个小片段发送，不能只检查一个 delta
 */
function collectAnswer(
    events: ReturnType<typeof parseSSE>
): string {
    return events
        .filter(event => event.name === 'delta')
        .map(event => event.data)
        .join('');
};

const app = createApp(createTestEnv());

describe('Thoth RAG regression', () => {
    /**
     * RAG-01: 相关问题的 Mock 向量和文档向量相同
     * 所以至少返回一个 source
     */
    it('RAG-01 returns sources for a related question', async () => {
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: 'Thoth Week3 为什么需要返回 sources？',
                toolChoice: 'none',
                rag: true,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(event => event.name);

        // RAG 协议顺序, starts, sources, delta, done
        expect(eventNames[0]).toBe('start');
        expect(eventNames[1]).toBe('sources');
        expect(eventNames).toContain('delta');
        expect(eventNames.at(-1)).toBe('done');
        expect(eventNames).not.toContain('error');

        const sourceEvent = events.find(event => event.name === 'sources');
        expect(sourceEvent).toBeDefined();

        const sourcePayload = parseSSEJson<SourcePayload>(sourceEvent!);
        expect(sourcePayload.sources.length).toBeGreaterThan(0);

        const firstSource = sourcePayload.sources[0];
        // 验证 source 不只是存在， 还包含前端展示所依赖的完整 metadata。
        expect(firstSource.id).toBeTruthy();
        expect(firstSource.documentId).toBeTruthy();
        expect(firstSource.title).toBeTruthy();
        expect(firstSource.source).toBeTruthy();
        expect(firstSource.content).toBeTruthy();
        expect(firstSource.chunkIndex).toBeGreaterThanOrEqual(0);
        // Mock 相关向量完全相同，因此相似度应当为 1。
        expect(firstSource.score).toBe(1);

        const doneEvent = events.find((event) => event.name === 'done');
        expect(doneEvent).toBeDefined();

        const done = parseSSEJson<DonePayload>(doneEvent!);
        expect(done.ok).toBe(true);
    });

    /**
     * RAG-02: 
     *  无关问题向量是 [0, 1]
     *  文档向量是 [1, 0]
     *
     * 相似度为 0，低于 MIN_RAG_SCORE 0.55，
     * 所有 Sources 都应该被过滤。
     */
    it('RAG-02 returns no sources for an unrelated question', async () => {
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: '南极企鹅今天中午吃了什么？',
                toolChoice: 'none',
                rag: true,
            })
            .expect(200)
            .expect(
                'Content-Type',
                /text\/event-stream/
            );
        const events = parseSSE(response.text);
        const eventNames = events.map(event => event.name);

        expect(eventNames[0]).toBe('start');
        expect(eventNames[1]).toBe('sources');
        expect(eventNames).toContain('delta');
        expect(eventNames.at(-1)).toBe('done');
        expect(eventNames).not.toContain('error');


        const sourceEvent = events.find((event) => event.name === 'sources');
        expect(sourceEvent).toBeDefined();

        const sourcePayload = parseSSEJson<SourcePayload>(sourceEvent!);
        // no-hit 仍然会sources， 但是数据控的
        expect(sourcePayload.sources).toEqual([]);

        const answer = collectAnswer(events);
        expect(answer).toContain('当前文档未覆盖这个问题')
    });

    /**
     * RAG-03: rag为false 必须跳过检索， 不仅不能返回 sources 也不能调用 Embedding
     */
    it('RAG-03 skips retrieval when RAG is disabled', async () => {
        const embedTextsMock = vi.mocked(embedTexts);
        embedTextsMock.mockClear();

        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: 'Thoth Week3 为什么需要返回 sources？',
                toolChoice: 'none',
                rag: false,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const events = parseSSE(response.text);
        const eventNames = events.map(event => event.name);

        expect(eventNames[0]).toBe('start');
        expect(eventNames).toContain('delta');
        expect(eventNames.at(-1)).toBe('done');

        expect(eventNames).not.toContain('sources');
        expect(eventNames).not.toContain('error');

        expect(embedTextsMock).not.toHaveBeenCalled();
    });
})