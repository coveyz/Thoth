/**
 * Thoth 服务端允许对外公开的稳定错误码。
 * 前端只能依赖这些稳定 code，不应该根据 Error.message 的具体文字判断错误类型。
 */
export type AppErrorCode =
    | "BAD_REQUEST"
    | "PROVIDER_ERROR"
    | "EMBEDDING_ERROR"
    | "TOOL_ERROR"
    | "FIRST_TOKEN_TIMEOUT"
    | "OVERALL_TIMEOUT"
    | "INTERNAL_ERROR"

/**
 * 发送给前端的公共错误结构
 */
export type PublicErrorPayload = {
    code: AppErrorCode;
    message: string;
};

const DEFAULT_PUBLIC_MESSAGES: Record<AppErrorCode, string> = {
    BAD_REQUEST: '请求参数不正确，请检查后重试',
    PROVIDER_ERROR: '模型服务暂时不可用，请稍后重试',
    EMBEDDING_ERROR: '知识库检索暂时不可用，请稍后重试',
    TOOL_ERROR: '工具执行失败，请稍后重试',
    FIRST_TOKEN_TIMEOUT: '模型响应超时，请稍后重试',
    OVERALL_TIMEOUT: '请求处理超时，请稍后重试',
    INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
};

type AppErrorOptions = {
    /**
       * 覆盖默认公开文案。
       *
       * 只应该传入确定安全、适合展示给用户的内容，
       * 不要直接把未知 error.message 放到这里。
    */
    publicMessage?: string;
    /**
     * 保存最初捕获的异常。
     *
     * cause 用于服务端日志和调试，
     * 不会出现在发送给前端的 PublicErrorPayload 中。
     */
    cause?: unknown;
};

/**
 * Thoth 内部统一使用的业务错误
 * 
 * 原生 Error 只有name， message， stack
 * AppError 额外携带稳定业务 code
 */
export class AppError extends Error {
    readonly code: AppErrorCode;

    constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
        const publicMessage = options.publicMessage ?? DEFAULT_PUBLIC_MESSAGES[code];

        super(publicMessage, { cause: options.cause })

        this.name = 'AppError';
        this.code = code;
    }
};

/** 
 * 判断 未知异常是否是 AbortError
 * AbortError 通常来自 AbortController: 
 *  1. 上游请求被中断
 *  2. SDK 抛出 name === AbortError
 */
export function isAbortError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'AbortError';
}

/**
 * 将任意 unknown 异常归一化成 AppError
 * catch 中的值必须按 unknown 处理，不能假定它一定是 Error
 */
export function normalizeError(error: unknown, fallbackCode: AppErrorCode = "INTERNAL_ERROR"): AppError {
    if (error instanceof AppError) return error;
    /**
     * 未分类异常使用调用方 提供的 fallbackCode
     * 
     * 原始异常放入 cause，供服务端日志使用；
     * 前端只能看到 fallbackCode 对应的安全文案。
     */
    return new AppError(fallbackCode, { cause: error });
};

/**
 * 把任意异常 转换成 可以安全发送到前端的结构
 */
export function toPublicError(error: unknown, fallbackCode: AppErrorCode = "INTERNAL_ERROR"): PublicErrorPayload {
    const normalized = normalizeError(error, fallbackCode);

    return {
        code: normalized.code,
        message: normalized.message
    }
}