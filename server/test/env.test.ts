import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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

    beforeEach(() => {
        // 固定无关配置，避免环境中的 Batch Size 干扰。
        vi.stubEnv(
            'THOTH_EMBEDDING_BATCH_SIZE',
            '32',
        );
    });

    it.each([
        { name: '未配置', raw: undefined },
        { name: '空字符串', raw: '' },
        { name: '纯空白', raw: '   ' },
    ])('$name 时使用默认知识库目录', ({ raw }) => {
        vi.stubEnv(
            'THOTH_KNOWLEDGE_DIR',
            raw,
        );

        expect(
            loadEnv().THOTH_KNOWLEDGE_DIR,
        ).toBe('./knowledge');
    });

    it('读取自定义目录并移除配置首尾空白', () => {
        vi.stubEnv(
            'THOTH_KNOWLEDGE_DIR',
            '  ./custom-knowledge  ',
        );

        expect(
            loadEnv().THOTH_KNOWLEDGE_DIR,
        ).toBe('./custom-knowledge');
    });

});