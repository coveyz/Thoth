import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForPromise } from "../src/lib/waitForPromise";


function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
};

afterEach(() => {
    vi.restoreAllMocks();
});


describe('可取消的 Promise 等待', () => {
    it('没有 signal 时直接返回原始 Promise', async () => {
        const source = Promise.resolve('ready');

        expect(waitForPromise(source)).toBe(source);

        await expect(waitForPromise(source)).resolves.toBe('ready');
    });


    it('任务成功时返回结果并清理监听器', async () => {
        const controller = new AbortController();

        const add = vi.spyOn(controller.signal, 'addEventListener');
        const remove = vi.spyOn(controller.signal, 'removeEventListener');

        await expect(
            waitForPromise(
                Promise.resolve('ready'),
                controller.signal
            )
        ).resolves.toBe('ready');

        const listener = add.mock.calls[0][1];

        expect(remove).toHaveBeenCalledWith(
            'abort',
            listener,
        );
    });

    it('任务失败时保留异常并清理监听器', async () => {
        const controller = new AbortController();
        const original = new Error('build failed');

        const add = vi.spyOn(controller.signal, 'addEventListener');
        const remove = vi.spyOn(controller.signal, 'removeEventListener');

        await expect(
            waitForPromise(
                Promise.reject(original),
                controller.signal
            )
        ).rejects.toBe(original);

        expect(remove).toHaveBeenCalledWith(
            'abort',
            add.mock.calls[0][1],
        );
    });

    it('已经取消时拒绝等待，并处理原始已拒绝 Promise', async () => {
        const controller = new AbortController();
        controller.abort();

        const source = Promise.reject(new Error('original failure'));

        await expect(
            waitForPromise(
                source,
                controller.signal
            )
        ).rejects.toBe(controller.signal.reason);
    });

    it('等待中取消立即退出，不必等待原始任务完成', async () => {
        const controller = new AbortController();
        const source = createDeferred<string>();

        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const pending = waitForPromise(
            source.promise,
            controller.signal
        );
        controller.abort();

        // 原始任务尚未完成，当前等待已经拒绝
        await expect(pending).rejects.toBe(controller.signal.reason);
        expect(remove).toHaveBeenCalledWith(
            'abort',
            expect.any(Function)
        );

        // 原始任务仍能独立成功
        source.resolve('completed later');

        await expect(source.promise).resolves.toBe('completed later');
    });

    it('一个调用者取消不影响其他调用者等待共享任务', async () => {
        const source = createDeferred<string>();
        const fistController = new AbortController();
        const secondController = new AbortController();

        const first = waitForPromise(
            source.promise,
            fistController.signal
        );
        const second = waitForPromise(
            source.promise,
            secondController.signal
        );

        let secondFinished = false;
        second.then(() => {
            secondFinished = true;
        });

        fistController.abort();

        await expect(first).rejects.toBe(
            fistController.signal.reason
        );

        expect(secondFinished).toBe(false);
        expect(secondController.signal.aborted).toBe(false);

        source.resolve('shared result');

        await expect(second).resolves.toBe('shared result');
    });

    it.each([
        { name: '开始等待前取消', cancelBefore: true },
        { name: '开始等待后取消', cancelBefore: false }
    ])('$name 后原始任务失败也没有未处理拒绝', async ({ cancelBefore }) => {
        const source = createDeferred<string>();
        const controller = new AbortController();

        if (cancelBefore) {
            controller.abort();
        };

        const pending = waitForPromise(
            source.promise,
            controller.signal
        );

        if (!cancelBefore) {
            controller.abort();
        };

        await expect(pending).rejects.toBe(controller.signal.reason);

        const onUnhandled = vi.fn();
        process.on('unhandledRejection', onUnhandled);

        try {
            source.reject(new Error('late shared failure'));

            await new Promise(resolve => {
                setImmediate(resolve);
            });

            expect(onUnhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', onUnhandled);
        };

    });

    it('成功结束后再取消不会改变已完成结果', async () => {
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const pending = waitForPromise(
            Promise.resolve('ready'),
            controller.signal
        );

        await expect(pending).resolves.toBe('ready');
        controller.abort();

        await expect(pending).resolves.toBe('ready');

        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('保留调用方提供的自定义取消原因', async() => {
        const source = createDeferred<string>();
        const controller = new AbortController();
        const reason = new Error('custom stop');

        const pending = waitForPromise(
            source.promise,
            controller.signal,
        );
        controller.abort(reason);

        await expect(pending).rejects.toBe(reason);

        source.resolve('finished later');

        await source.promise;
    });

});