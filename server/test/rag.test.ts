import { unlink, utimes } from 'node:fs/promises';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_RAG_INDEX_CONFIG } from '../src/rag/config';
import { createTestEnv } from './helpers/createTestEnv';
import { parseSSE, parseSSEJson } from './helpers/parseSSE';
import { createApp } from '../src/app';
import { embedTexts } from '../src/rag/embedding';
import { createTestKnowledge } from './helpers/createTestKnowledge';
import { loadKnowledgeDocuments } from '../src/rag/loader';
import { buildRagIndex } from '../src/rag/indexBuilder';
import { createRagIndexManager } from '../src/rag/indexManager';
import type { EmbeddingFunction } from '../src/rag/embeddingBatch';
import type { QueryEmbeddingFunction } from '../src/rag/retriever';
import type { RagRuntime } from '../src/rag/runtime';
import type { RagSource } from '../src/rag/types';
import { prepareRagTurn } from '../src/orchestrators/ragOrchestrators';


const UPDATED_AT = '2026-01-01T00:00:00.000Z';

/**
 * 真实 Loader、Builder、Manager、Retriever
 * 仅注入确定性的文档和问题 Embedding
 */
async function createRagFixture() {
    const knowledge = await createTestKnowledge();

    try {
        const filePath = await knowledge.write(
            'guide.md',
            [
                '# RAG 测试文档',
                '',
                'Thoth Week3 返回 sources，是为了让回答可以追溯依据。',
            ].join('\n')
        );

        const modifiedAt = new Date(UPDATED_AT);
        await utimes(filePath, modifiedAt, modifiedAt);

        const env = createTestEnv({
            THOTH_KNOWLEDGE_DIR: knowledge.root
        });

        const loadDocuments = vi.fn(loadKnowledgeDocuments);
        const embedDocuments = vi.fn<EmbeddingFunction>(
            async (texts) => texts.map(() => [1, 0])
        );
        const embedQuery = vi.fn<QueryEmbeddingFunction>(
            async (texts: string[]) => {
                return texts.map(text => {
                    return text.includes('Week3') || text.includes('sources') ? [1, 0] : [0, 1];
                })
            }
        );

        const build = vi.fn(() => {
            return buildRagIndex(
                {
                    knowledgeDir: env.THOTH_KNOWLEDGE_DIR,
                    config: {
                        ...DEFAULT_RAG_INDEX_CONFIG,
                        embeddingBatchSize: env.THOTH_EMBEDDING_BATCH_SIZE
                    }
                },
                {
                    embed: embedDocuments,
                    loadDocuments: loadDocuments
                }
            )
        });

        const indexManager = createRagIndexManager({ build })

        const rag: RagRuntime = {
            indexManager,
            embedQuery
        };

        const app = createApp(env, { rag });

        return {
            app, env, rag, knowledge, filePath,
            build, loadDocuments, embedDocuments, embedQuery
        }

    } catch (error: unknown) {
        await knowledge.cleanup();
        throw error;
    };
};

let fixture: Awaited<ReturnType<typeof createRagFixture>>

beforeEach(async () => {
    fixture = await createRagFixture();
});

afterEach(async () => {
    await fixture.knowledge.cleanup();
});

async function sendChat(message: string, rag = true) {
    return request(fixture.app)
        .post('/api/chat/stream')
        .set('Accept', 'text/event-stream')
        .send({
            message,
            toolChoice: 'none',
            rag,
        })
        .expect(200)
        .expect(
            'Content-Type',
            /text\/event-stream/,
        );
};

function readSources(text: string): RagSource[] {
    const event = parseSSE(text).find(item => {
        return item.name === 'sources';
    });

    expect(event).toBeDefined();

    return parseSSEJson<{ sources: RagSource[] }>(event!).sources;
};

function collectAnswer(text: string): string {
    return parseSSE(text)
        .filter((event) => event.name === 'delta')
        .map((event) => event.data)
        .join('');
};

describe('本地索引 RAG 回归', () => {
    it('RAG-01 命中文档并按兼容 SSE 顺序返回完整 Sources', async () => {
        const response = await sendChat('Thoth Week3 为什么需要返回 sources？');
        const names = parseSSE(response.text).map(event => event.name);

        expect(names[0]).toBe('start');
        expect(names[1]).toBe('sources');
        expect(names).toContain('delta');
        expect(names.at(-1)).toBe('done');
        expect(names).not.toContain('error');

        const sources = readSources(response.text);
        expect(sources).toHaveLength(1);

        expect(sources[0]).toMatchObject({
            title: 'RAG 测试文档',
            source: 'guide.md',
            path: 'guide.md',
            updatedAt: UPDATED_AT,
            chunkIndex: 0,
            score: 1,
        });
        expect(sources[0].id).toBeTruthy();
        expect(sources[0].documentId).toBeTruthy();
        expect(sources[0].content).toContain('Week3');
        expect(sources[0]).not.toHaveProperty('embedding');

        expect(JSON.stringify(sources)).not.toContain(fixture.knowledge.root);

        expect(
            fixture.embedQuery.mock.calls[0][1]?.signal,
        ).toBeInstanceOf(AbortSignal);
        expect(fixture.build).toHaveBeenCalledTimes(1);
        expect(fixture.loadDocuments).toHaveBeenCalledTimes(1);
    });

    it('RAG-02 无关问题返回空 Sources 和文档未覆盖提示', async () => {
        const response = await sendChat('南极企鹅今天中午吃了什么？');

        expect(readSources(response.text)).toEqual([]);
        expect(collectAnswer(response.text)).toContain('当前文档未覆盖这个问题')

        const names = parseSSE(response.text).map(event => event.name);
        expect(names).not.toContain('error');
        expect(names.at(-1)).toBe('done');
    });

    it('RAG-03 关闭 RAG 时不读取文档、不构建、不调用 Embedding', async () => {
        const response = await sendChat(
            'Thoth Week3 为什么需要 sources?',
            false
        );

        const names = parseSSE(response.text).map(event => event.name);
        expect(names[0]).toBe('start');
        expect(names).toContain('delta');
        expect(names.at(-1)).toBe('done');
        expect(names).not.toContain('sources');
        expect(names).not.toContain('error');

        expect(fixture.build).not.toHaveBeenCalled();
        expect(fixture.loadDocuments).not.toHaveBeenCalled();
        expect(fixture.embedDocuments).not.toHaveBeenCalled();
        expect(fixture.embedQuery).not.toHaveBeenCalled();
        expect(fixture.rag.indexManager.getState().status.state).toBe('pending');
    });

    it('连续查询复用文档索引，每次只新增问题 Embedding', async () => {
        await sendChat('Week3 为什么返回引用？');
        const firstSnapshot = fixture.rag.indexManager.getSnapshot();
        await sendChat('sources 有什么作用？');

        expect(fixture.rag.indexManager.getSnapshot()).toBe(firstSnapshot);
        expect(fixture.build).toHaveBeenCalledTimes(1);
        expect(fixture.loadDocuments).toHaveBeenCalledTimes(1)
        expect(fixture.embedDocuments).toHaveBeenCalledTimes(1)
        expect(fixture.embedQuery).toHaveBeenCalledTimes(2)
    });

    it('空知识库返回 no-hit 且不调用任何 Embedding', async () => {
        await unlink(fixture.filePath);

        const response = await sendChat('Week3 文档说了什么？');

        expect(readSources(response.text)).toEqual([]);
        expect(collectAnswer(response.text)).toContain('当前文档未覆盖这个问题');

        expect(fixture.embedDocuments).not.toHaveBeenCalled();
        expect(fixture.embedQuery).not.toHaveBeenCalled();

        expect(fixture.rag.indexManager.getState().status).toMatchObject({
            state: 'ready',
            documentCount: 0,
            chunkCount: 0
        })
    });

    it('默认 App 使用本地知识库，缺少 Embedding Key 时安全报错', async () => {
        /**
         * 不注入 Runtime，验证默认组装路径。
         * 测试 Env 的 Key 为空，Provider 会在 SDK 调用前失败。
         */
        const app = createApp(fixture.env);
        const response = await request(app)
            .post('/api/chat/stream')
            .set('Accept', 'text/event-stream')
            .send({
                message: 'Week3 文档说了什么？',
                toolChoice: 'none',
                rag: true,
            })
            .expect(200);

        const events = parseSSE(response.text);
        expect(events.map((event) => event.name)).toEqual(['start', 'error']);

        const payload = parseSSEJson<{
            code: string;
            message: string;
            requestId: string;
        }>(events[1]);

        expect(payload.code).toBe('EMBEDDING_ERROR');
        expect(payload.message).toBe('知识库检索暂时不可用，请稍后重试');
        expect(payload.requestId).toBeTruthy();

        expect(response.text).not.toContain(fixture.knowledge.root);
    });

    it('编排将完整引用 metadata 写入 Prompt，并传递查询 signal', async () => {
        const controller = new AbortController();

        const prepared = await prepareRagTurn({
            userMessage: 'Week3 sources 有什么作用？',
            rag: fixture.rag,
            signal: controller.signal,
        });

        const source = prepared.sources[0];
        expect(source).toBeDefined();

        const prompt = prepared.finalMessages
            .map((message) => message.content)
            .join('\n');
        expect(prompt).toContain(`[source 1]`);
        expect(prompt).toContain(`id: ${source.id}`);
        expect(prompt).toContain(`documentId: ${source.documentId}`);
        expect(prompt).toContain('path: guide.md');
        expect(prompt).toContain(`updatedAt: ${UPDATED_AT}`);
        expect(prompt).toContain('chunkIndex: 0');

        expect(prompt).not.toContain('embedding');
        expect(fixture.embedQuery).toHaveBeenCalledWith(
            ['Week3 sources 有什么作用？'],
            { signal: controller.signal },
        );

    });


});