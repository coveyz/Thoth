import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEnv } from "./helpers/createTestEnv";
import { embedTexts } from "../src/rag/embedding";
import { toPublicError } from "../src/lib/error";


/**
 * vi.mock 会提升执行。
 * 控制对象也通过 vi.hoisted 提前创建。
 */
const sdk = vi.hoisted(() => ({
    create: vi.fn(),
    configure: vi.fn(),
}));

/**
 * 替换 SDK Client：
 * 不创建真实连接，不发送任何网络请求。
 */
vi.mock('openai', () => ({
    default: class FakeOpenAI {
        embeddings = {
            create: sdk.create,
        };

        constructor(options: unknown) {
            sdk.configure(options);
        }
    },
}));


const env = createTestEnv({
    THOTH_EMBEDDING_API_KEY: 'test-only-key',
});

beforeEach(() => {
    sdk.create.mockReset();
    sdk.configure.mockReset();
});

describe('Embedding Provider', () => {
    it('空输入直接返回且不创建 SDK Client', async () => {
        await expect(
            embedTexts([], createTestEnv()),
        ).resolves.toEqual([]);
    })

    it('没有 Embedding Key 时返回安全错误且不发请求', async () => {
        await expect(embedTexts(['正文'], createTestEnv())).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
        });

        expect(sdk.configure).not.toHaveBeenCalled();
        expect(sdk.create).not.toHaveBeenCalled();
    });

    it('按 index 恢复输入顺序且不修改响应数组', async () => {
        const data = [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
        ];

        sdk.create.mockResolvedValue({ data });

        await expect(
            embedTexts(['第一段', '第二段'], env),
        ).resolves.toEqual([
            [1, 0],
            [0, 1],
        ]);

        expect(data.map((item) => item.index))
            .toEqual([1, 0]);

        expect(sdk.configure).toHaveBeenCalledWith(
            expect.objectContaining({
                timeout: 30_000,
                maxRetries: 0,
            }),
        );
    });

    it.each([
        {
            name: '缺少 data',
            response: {},
        },
        {
            name: '向量数量不足',
            response: {
                data: [
                    { index: 0, embedding: [1, 0] },
                ],
            },
        },
        {
            name: '向量数量过多',
            response: {
                data: [
                    { index: 0, embedding: [1, 0] },
                    { index: 1, embedding: [0, 1] },
                    { index: 2, embedding: [1, 1] },
                ],
            },
        },
        {
            name: '重复 index',
            response: {
                data: [
                    { index: 0, embedding: [1, 0] },
                    { index: 0, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '缺失合法 index 并包含越界 index',
            response: {
                data: [
                    { index: 0, embedding: [1, 0] },
                    { index: 2, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '负数 index',
            response: {
                data: [
                    { index: -1, embedding: [1, 0] },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '小数 index',
            response: {
                data: [
                    { index: 0.5, embedding: [1, 0] },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '空向量',
            response: {
                data: [
                    { index: 0, embedding: [] },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
        {
            name: 'NaN 向量',
            response: {
                data: [
                    { index: 0, embedding: [Number.NaN, 0] },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '无穷大向量',
            response: {
                data: [
                    {
                        index: 0,
                        embedding: [Number.POSITIVE_INFINITY, 0],
                    },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
        {
            name: '同批向量维度不一致',
            response: {
                data: [
                    { index: 0, embedding: [1] },
                    { index: 1, embedding: [0, 1] },
                ],
            },
        },
    ])('拒绝非法响应：$name', async ({ response }) => {
        sdk.create.mockResolvedValue(response);

        await expect(
            embedTexts(['第一段', '第二段'], env),
        ).rejects.toMatchObject({
            code: 'EMBEDDING_ERROR',
        });
    });

    it('上游异常转换为安全文案并保留原始 cause', async () => {
        const original = new Error('private provider response and secret key');
        sdk.create.mockRejectedValue(original);

        let caught: unknown;

        try {
            await embedTexts(['正文'], env);
        } catch (error: unknown) {
            caught = error;
        }

        expect(caught).toMatchObject({
            code: 'EMBEDDING_ERROR',
            cause: original,
        });

        const payload = toPublicError(caught);

        expect(payload).toEqual({
            code: 'EMBEDDING_ERROR',
            message: '知识库检索暂时不可用，请稍后重试',
        });

        expect(JSON.stringify(payload))
            .not.toContain('private provider response');
        expect(JSON.stringify(payload))
            .not.toContain('secret key');
    });


    it('将同一个 AbortSignal 传给 SDK 请求', async () => {
        const controller = new AbortController();

        sdk.create.mockResolvedValue({
            data: [
                { index: 0, embedding: [1, 0] },
            ],
        });

        await embedTexts(['正文'], env, {
            signal: controller.signal,
        });

        expect(sdk.create).toHaveBeenCalledWith(
            {
                model: env.THOTH_EMBEDDING_MODEL,
                input: ['正文'],
                encoding_format: 'float',
            },
            {
                signal: controller.signal,
            },
        );
    });


    it('请求开始前已取消时不创建 Client 或调用 SDK', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            embedTexts(['正文'], env, { signal: controller.signal })
        ).rejects.toBe(controller.signal.reason);

        expect(sdk.configure).not.toHaveBeenCalled();
        expect(sdk.create).not.toHaveBeenCalled();
    });

    it('请求期间取消时保留取消语义而非包装成服务错误', async () => {
        const controller = new AbortController();

        sdk.create.mockImplementation(
            (
                _input: unknown,
                options: { signal?: AbortSignal },
            ) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener(
                        'abort',
                        () => reject(
                            new Error('SDK-specific cancellation'),
                        ),
                        { once: true },
                    );
                }),
        );

        const pending = embedTexts(['正文'], env, {
            signal: controller.signal
        });

        controller.abort();

        await expect(pending).rejects.toBe(controller.signal.reason);
    });

    it('没有 signal 时也保留上游标准 AbortError', async () => {
        const original = new Error('cancelled');
        original.name = 'AbortError';

        sdk.create.mockRejectedValue(original);

        await expect(
            embedTexts(['正文'], env)
        ).rejects.toBe(original);
    });
})
