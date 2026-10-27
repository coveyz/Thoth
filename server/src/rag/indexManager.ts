import { normalizeError, toPublicError } from "../lib/error";
import type { RagIndexBuildResult } from "./indexBuilder";
import type { RagIndexFailure, RagIndexSnapshot, RagIndexState, RagIndexStatus, RagLoadDiagnostic } from "./types";


/** Manager 只需要构建一次完整结果的能力 */
export type RagIndexBuildFunction = () => Promise<RagIndexBuildResult>;

export type CreateRagIndexManagerOptions = {
    build: RagIndexBuildFunction;
    now?: () => Date;
};

export type RagIndexManager = {
    getSnapshot: () => RagIndexSnapshot | null;
    getState: () => RagIndexState;
    getDiagnostics: () => RagLoadDiagnostic[];
    ensureReady: () => Promise<RagIndexSnapshot>;
    rebuild: () => Promise<RagIndexSnapshot>;
};

export function createRagIndexManager(
    options: CreateRagIndexManagerOptions
): RagIndexManager {
    const build = options.build;
    const now = options.now ?? (() => new Date());

    let currentSnapshot: RagIndexSnapshot | null = null;
    let status: RagIndexStatus = { state: 'pending' };
    let lastFailure: RagIndexFailure | null = null;
    let diagnostics: RagLoadDiagnostic[] = [];

    /** 只保存正在执行的任务 ｜  成功和失败全都清楚 */
    let buildingPromise: Promise<RagIndexSnapshot> | null = null;

    function getSnapshot(): RagIndexSnapshot | null {
        return currentSnapshot;
    };

    function getState(): RagIndexState {
        /** 状态摘要返回副本，避免调用方修改内部状态 */
        const statusCopy: RagIndexStatus =
            status.state === 'failed'
                ? { state: 'failed', failure: { ...status.failure } }
                : { ...status }

        return {
            currentSnapshot,
            status: statusCopy,
            lastFailure: lastFailure === null
                ? null
                : { ...lastFailure }
        };
    };

    function getDiagnostics(): RagLoadDiagnostic[] {
        return diagnostics.map((diagnostic) => ({ ...diagnostic }));
    };

    /** 显式重建 */
    function rebuild(): Promise<RagIndexSnapshot> {
        if (buildingPromise !== null) {
            return buildingPromise;
        };

        status = {
            state: 'indexing',
            startedAt: now().toISOString()
        };

        // 延后到微任务中调用 build：
        // 1. 先保存 buildPromise 在真正执行构建
        // 2. build 即使同步抛错 也进入统一的 catch

        const promise = Promise.resolve()
            .then(build)
            .then((result) => {
                // 先准备全部数据， 准备期间失败的话 旧快照保持不变
                const nextSnapshot = result.snapshot;
                const nextDiagnostics = result.diagnostics.map((diagnostic) => ({ ...diagnostic }));
                const nextStatus: RagIndexStatus = {
                    state: 'ready',
                    builtAt: nextSnapshot.builtAt,
                    documentCount: nextSnapshot.documentCount,
                    chunkCount: nextSnapshot.chunkCount
                };

                currentSnapshot = nextSnapshot;
                diagnostics = nextDiagnostics;
                status = nextStatus;
                lastFailure = null;

                return nextSnapshot;
            })
            .catch((error: unknown) => {
                const normalized = normalizeError(error, 'RAG_INDEX_ERROR');
                const publicError = toPublicError(normalized);
                const failure: RagIndexFailure = {
                    failedAt: now().toISOString(),
                    code: publicError.code,
                    message: publicError.message
                };

                lastFailure = failure;
                status = {
                    state: 'failed',
                    failure: failure
                };
                //不修改 currentSnapshot 和成功诊断。
                throw normalized;
            })
            .finally(() =>{
                buildingPromise = null;
            });

        buildingPromise = promise;

        return promise;
    };

    /**
     * 查询准备入口
     *  - 有可用快照：直接返回，包括合法空快照
     *  - 无可用快照：开始构建，或复用正在执行的构建
     */
    function ensureReady(): Promise<RagIndexSnapshot> {
        if (currentSnapshot !== null) {
            return Promise.resolve(currentSnapshot);
        };
        
        return rebuild();
    };

    return {
        getSnapshot,
        getState,
        getDiagnostics,
        ensureReady,
        rebuild
    }
}

