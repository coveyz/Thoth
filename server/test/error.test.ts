import { describe, expect, it } from "vitest";

import { AppError, isAbortError, normalizeError, toPublicError } from "../src/lib/error";


describe('error contract', () => {
    /** 
     * 已知 错误应该保留自己 code 和 公开文案
     */
    it('keeps a known AppError unchanged', () => {
        const original = new AppError("BAD_REQUEST", { publicMessage: "message is required" });
        const normalized = normalizeError(original);

        expect(normalized).toBe(original);
        expect(normalized.code).toBe("BAD_REQUEST");
        expect(normalized.message).toBe("message is required");
    });

    /**
     * 未知异常不能把原始 message 直接暴露给前端
     */
    it('hides the original message of an unknown error', () => {
        const original = new Error('secret upstream detail');
        const result = toPublicError(original);

        expect(result).toEqual({
            code: 'INTERNAL_ERROR',
            message: '服务暂时不可用，请稍后重试'
        });

        expect(result.message).not.toContain('secret upstream detail');
    });

    /**
     * 调用方知道异常发生在哪一层时，可以提供更准确的 fallbackCode。
     */
    it('uses the requested fallback code', () => {
        const original = new Error('network connection failed');
        const result = toPublicError(original, 'PROVIDER_ERROR');

        expect(result).toEqual({
            code: 'PROVIDER_ERROR',
            message: '模型服务暂时不可用，请稍后重试'
        });
    });

    /**
     * AppError 应保存原始 cause，供服务端日志定位根因
     */
    it('keeps the original error as cause', () => {
        const original = new Error('embedding request failed');
        const normalized = normalizeError(original, 'EMBEDDING_ERROR');

        expect(normalized.code).toBe('EMBEDDING_ERROR');
        expect(normalized.cause).toBe(original);
        expect(normalized.message).toBe('知识库检索暂时不可用，请稍后重试');
    });

    it('recognizes AbortError', () => {
        const abortError = new Error('request aborted');
        abortError.name = 'AbortError';

        expect(isAbortError(abortError)).toBe(true);
        expect(isAbortError(new Error('normal failure'))).toBe(false);
        expect(isAbortError('AbortError')).toBe(false);
    });
});