// 创建临时知识库测试工具

import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

export async function createTestKnowledge() {
    const root = await mkdtemp(path.join(tmpdir(), 'thoth-knowledge-'))

    return {
        root,
        async write(relativePath: string, content: string | Uint8Array): Promise<string> {
            const absolutePath = path.resolve(root, relativePath);
            const relative = path.relative(root, absolutePath);

            if (
                path.isAbsolute(relative)
                || relative === '..'
                || relative.startsWith(`..${path.sep}`)
                || relative === ''
            ) {
                throw new Error('Test file muse be inside temporary root');
            };

            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, content);

            return absolutePath;
        },
        /** 只清理这个工具自己创建的临时目录 */
        async cleanup(): Promise<void> {
            await rm(root, { recursive: true, force: true });
        }
    };
};