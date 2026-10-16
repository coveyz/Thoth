import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import * as path from "node:path";
import { constants } from "node:fs";
import type { Stats } from "node:fs";

import { normalizeError } from "../lib/error";
import type { RagLoadDiagnostic, RagLoadResult, RagRawDocument } from "./types";


/**
 * 只注入需要控制的文件打开操作。
 */
export type LoadKnowledgeOptions = {
    openFile?: typeof open
};

type FileCandidate = {
    /** 仅在服务端内部使用 */
    absolutePath: string;
    /** 对外 metadata 使用 */
    relativePath: string;
};

/** 使用字符顺序比较，避免依赖机器语言环境 */
function comparePaths(left: string, right: string): number {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

/**
 * 检查路径是否在知识库目录内
 *  - /knowledge-other 不属于 /knowledge
 */
function assertInsideRoot(root: string, candidate: string): void {
    const relativePath = path.relative(root, candidate);

    if (
        path.isAbsolute(relativePath)
        || relativePath === '..'
        || relativePath.startsWith(`..${path.sep}`)
    ) {
        throw new Error('Document path is outside knowledge root');
    };
};

/** 转换 为对外使用的规范相对路径 */
function toRelativePath(root: string, absolutePath: string): string {
    assertInsideRoot(root, absolutePath);

    return path
        .relative(root, absolutePath)
        .split(path.sep)
        .join('/');
};

/**
 * 文档ID 只依赖相对路径
 *  - 内容变化、文件修改时间变化、知识库根目录迁移（都不会改变同一相对路径的文档 ID
 */
function createDocumentId(relativePath: string): string {
    const hash = createHash('sha256').update(relativePath, 'utf-8').digest('hex');
    return `doc-${hash}`;
};

/**
 * 扫描候选文件
 * @param root 知识库根目录
 * @param directory 要扫描的子目录
 * @param candidates 收集到的候选文件列表
 */
async function collectCandidates(
    root: string,
    directory: string,
    candidates: FileCandidate[]
) {
    const directoryStat = await lstat(directory);

    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
        throw new Error('Knowledge root is not a regular directory')
    };

    const canonicalDirectory = await realpath(directory);
    assertInsideRoot(root, canonicalDirectory);

    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        // 隐藏目录跳过，不扫描
        if (entry.name.startsWith('.')) continue;
        // 不跟随文件软链接或目录软链接
        if (entry.isSymbolicLink()) continue;

        const absolutePath = path.join(directory, entry.name);
        assertInsideRoot(root, absolutePath);

        if (entry.isDirectory()) {
            await collectCandidates(root, absolutePath, candidates);
            continue;
        };

        // socket 设备 FIFO 等也不读取
        if (!entry.isFile()) continue;

        const extension = path.extname(entry.name).toLocaleLowerCase();
        if (extension !== '.md' && extension !== '.txt') {
            continue;
        };

        candidates.push({
            absolutePath,
            relativePath: toRelativePath(root, absolutePath),
        })
    };
};

/**
 * 检查文件内容 在读取区间是否发生变化
 */
function assertUnchanged(before: Stats, after: Stats) {
    if (
        before.dev !== after.dev
        || before.ino !== after.ino
        || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs
        || before.ctimeMs !== after.ctimeMs
    ) {
        throw new Error('Document changed while being read');
    }
}

/**
 * 使用 文件句柄读取一个候选文件 （绝对路径不放到返回值
 */
async function readCandidate(root: string, candidate: FileCandidate, openFile: typeof open): Promise<{ content: string, updatedAt: string }> {
    const expected = await lstat(candidate.absolutePath);

    if (expected.isSymbolicLink() || !expected.isFile()) {
        throw new Error('Document is not a regular file');
    };

    const canonicalPath = await realpath(candidate.absolutePath);
    assertInsideRoot(root, canonicalPath);

    // O_NOFOLLOW 阻止最终文件路径是软连接时被打开
    const handle = await openFile(candidate.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW,)

    try {
        const before = await handle.stat();
        // 扫描与打开之间，文件可能被替换 （ dev + ino 用于确认打开的是刚才检查的文件
        if (
            !before.isFile()
            || before.dev !== expected.dev
            || before.ino !== expected.ino
        ) {
            throw new Error('Document changed before being opened');
        };
        // 打开后，读取之前再次及纳差实际路径边界
        const openedPath = await realpath(candidate.absolutePath);

        assertInsideRoot(root, openedPath);
        const bytes = await handle.readFile();
        const after = await handle.stat();
        assertUnchanged(before, after);
        // 将读取的字节解码为 UTF-8 字符串，并统一换行符为 '\n', 非法字符会抛出异常
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n');

        return {
            content,
            updatedAt: before.mtime.toISOString()
        }
    } finally {
        // 成功与否 最后都关句柄
        await handle.close();
    };
};

/**
 * 提取正文中的第一个 ATX 一级标题，例如 "# 标题" （忽略 ``` 和 ~~~ 代码围栏里的伪标题
 */
function extractMarkdownTitle(content: string): string | undefined {
    let fence: { marker: string, length: number } | null = null;

    for (const line of content.split('\n')) {
        const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

        if (fenceMatch) {
            const marker = fenceMatch[1][0];
            const length = fenceMatch[1].length;
            const suffix = fenceMatch[2].trim();

            if (!fence) {
                fence = { marker, length };
            } else if (marker === fence.marker && length >= fence.length && suffix === '') {
                fence = null;
            };

            continue;
        };

        if (fence) continue;

        const heading = line.match(/^ {0,3}#(?:[ \t]+|$)(.*)$/);
        if (!heading) continue;

        const title = heading[1].replace(/[ \t]+#+[ \t]*$/, '').trim();
        if (title) return title;
    };

    return undefined;
};

/**
 * TXT 和 没有一级标题的 Markdown 使用文件名
 */
function getDocumentTitle(relativePath: string, content: string): string {
    const extension = path.posix.extname(relativePath);
    const fileName = path.posix.basename(relativePath, extension);

    if (extension.toLocaleLowerCase() === '.md') {
        return extractMarkdownTitle(content) ?? fileName;
    };

    return fileName;
};

/**
 * 加载整个本地知识库
 *  - 只负责文件接入和metadata
 */
export async function loadKnowledgeDocuments(
    knowledgeDir: string,
    options: LoadKnowledgeOptions = {}
): Promise<RagLoadResult> {
    try {
        if (!knowledgeDir.trim()) {
            throw new Error('Knowledge directory is required');
        };

        const configureRoot = path.resolve(knowledgeDir);
        const rootStat = await lstat(configureRoot);

        // 如果根目录也不能是软连接
        if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
            throw new Error('Knowledge root is not a regular directory')
        };

        const root = await realpath(configureRoot);
        const candidates: FileCandidate[] = [];

        await collectCandidates(root, root, candidates);
        // 最终排序整个文件集合，而不依赖 readdir 顺序
        candidates.sort((a, b) => comparePaths(a.relativePath, b.relativePath));

        const documents: RagRawDocument[] = []
        const diagnostics: RagLoadDiagnostic[] = [];
        const openFile = options.openFile ?? open;

        for (const candidate of candidates) {
            const { content, updatedAt } = await readCandidate(root, candidate, openFile);

            if (!content.trim()) {
                diagnostics.push({
                    code: 'EMPTY_DOCUMENT',
                    path: candidate.relativePath,
                    message: '文档为空，已跳过'
                });
                continue;
            };

            documents.push({
                id: createDocumentId(candidate.relativePath),
                title: getDocumentTitle(candidate.relativePath, content),
                source: candidate.relativePath, 
                path: candidate.relativePath,
                updatedAt: updatedAt,
                content
            });
        };

        return { documents, diagnostics }
    } catch (error: unknown) {
        // 原始错误保留在 cause 中供服务端诊断， 公开message使用统一安全文案
        throw normalizeError(error, 'DOCUMENT_LOAD_ERROR')
    }
}