import { afterEach, describe, expect, it, vi } from "vitest";

import { loadEnv } from "../src/lib/env";
import { DEFAULT_RAG_INDEX_CONFIG } from "../src/rag/config";


const BATCH_SIZE_NAME =
    'THOTH_EMBEDDING_BATCH_SIZE';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Embedding Batch 环境配置', () => {
    it('未配置时使用统一默认值', () => {
        vi.stubEnv(BATCH_SIZE_NAME, undefined);

        expect(
            loadEnv().THOTH_EMBEDDING_BATCH_SIZE,
        ).toBe(
            DEFAULT_RAG_INDEX_CONFIG.embeddingBatchSize,
        );
    });

    it.each([
        { name: '空字符串', raw: '' },
        { name: '纯空白', raw: '   ' },
    ])('$name 使用默认值', ({ raw }) => {
        vi.stubEnv(BATCH_SIZE_NAME, raw);

        expect(
            loadEnv().THOTH_EMBEDDING_BATCH_SIZE,
        ).toBe(
            DEFAULT_RAG_INDEX_CONFIG.embeddingBatchSize,
        );
    });

    it('读取合法的自定义正整数', () => {
        vi.stubEnv(BATCH_SIZE_NAME, '8');

        expect(
            loadEnv().THOTH_EMBEDDING_BATCH_SIZE,
        ).toBe(8);
    });

    it.each([
        { raw: '0' },
        { raw: '-1' },
        { raw: '1.5' },
        { raw: 'NaN' },
        { raw: 'Infinity' },
        { raw: 'not-a-number' },
        { raw: '9007199254740992' },
    ])('拒绝非法配置：$raw', ({ raw }) => {
        vi.stubEnv(BATCH_SIZE_NAME, raw);

        expect(() => loadEnv()).toThrow(
            'THOTH_EMBEDDING_BATCH_SIZE must be a positive safe integer',
        );
    });

});