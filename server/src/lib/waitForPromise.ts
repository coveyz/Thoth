
/**
 * 等待一个 Promise，允许当前调用者通过 signal 停止等待
 *  - 不取消 原始任务，不调用任何共享 AbortController
 *  - 原始 Promise 后续失败时，仍有拒绝处理器接住
 */
export function waitForPromise<T>(
    source: Promise<T>,
    signal?: AbortSignal
): Promise<T> {
    if (signal === undefined) return source;

    const activeSignal = signal;


    return new Promise<T>((resolve, reject) => {
        let settled = false;

        function cleanup(): void {
            activeSignal.removeEventListener('abort', onAbort);
        };

        /**
         * 成功，失败 取消只允许其中一个决定结果
         * 每条结束路径都清理取消监听器
         */
        function settleOnce(
            settle: () => void
        ): void {
            if (settled) return;

            settled = true;
            cleanup();
            settle();
        };

        function onAbort() {
            settleOnce(() => reject(activeSignal.reason));
        };

        activeSignal.addEventListener('abort', onAbort, { once: true });

        /**
         * 无论当前请求是否取消， 都保留对原始任务成功和失败处理
         *  - 取消后 source再失败，回调会执行， 但 settleOnce 不会再次改变结果或抛出异常
         */
        source.then(
            (value) => {
                settleOnce(() => resolve(value))
            },
            (error: unknown) => {
                settleOnce(() => reject(error))
            }
        );

        /**
         * 已取消的 signal 不会因为新注册的监听器
         * 再自动触发一次 abort 因为必须主动检查
         *  - 先安装 source 的拒绝处理，再处理已取消状态
         */
        if (activeSignal.aborted) {
            onAbort();
        }
    })

}