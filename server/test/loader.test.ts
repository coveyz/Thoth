import { utimes } from "fs/promises";
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { symlink, type open } from 'node:fs/promises';

import { createTestKnowledge } from "./helpers/createTestKnowledge";
import { loadKnowledgeDocuments } from "../src/rag/loader";
import { toPublicError } from "../src/lib/error";


type TestKnowledge = Awaited<ReturnType<typeof createTestKnowledge>>;

let knowledge: TestKnowledge;
const temporaryDirectories: TestKnowledge[] = [];

async function createKnowledge() {
    const result = await createTestKnowledge();
    temporaryDirectories.push(result);
    return result;
}

beforeEach(async () => {
    knowledge = await createKnowledge();
});

afterEach(async () => {
    // 即使测试断言失败，afterEach 也负责清理。
    const directories = temporaryDirectories.splice(0);

    await Promise.all(directories.map(directory => directory.cleanup()))
});



describe('本地知识库文档加载器', () => {
    it('读取 UTF-8 Markdown 并提取标题和完整元数据', async () => {
        const filePath = await knowledge.write(
            'guide.md',
            [
                '```md',
                '# 代码中的伪标题',
                '```',
                '# 真正的标题',
                '',
                '中文正文。',
            ].join('\r\n'),
        );
        const modifiedAt = new Date('2026-01-02T03:04:05.000Z');

        await utimes(filePath, modifiedAt, modifiedAt);

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.diagnostics).toEqual([]);
        expect(result.documents).toHaveLength(1);

        const document = result.documents[0];

        expect(document.id).toMatch(/^doc-[a-f0-9]{64}$/);
        expect(document.title).toBe('真正的标题');
        expect(document.source).toBe('guide.md');
        expect(document.path).toBe('guide.md');
        expect(document.updatedAt).toBe(modifiedAt.toISOString());
        expect(document.content).toContain('中文正文。');
        expect(document.content).not.toContain('\r');

        // 整个公开文档结构不包含机器绝对根路径。
        expect(JSON.stringify(document)).not.toContain(knowledge.root);
        expect(path.isAbsolute(document.path)).toBe(false);
    })

    it('使用文件名作为 TXT 文档标题', async () => {
        await knowledge.write(
            'week2-tools.txt',
            '# 这在 TXT 中不是 Markdown 标题\n工具说明。',
        );

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents[0].title).toBe('week2-tools');
        expect(result.documents[0].content).toContain('工具说明')
    });

    it('Markdown 没有一级标题时使用文件名', async () => {
        await knowledge.write('notes.md', '## 二级标题\n正文。',)

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents[0].title).toBe('notes');
    });

    it('递归读取子目录并按规范化相对路径排序', async () => {
        // 故意按不同于预期输出的顺序创建文件。
        await knowledge.write('z.txt', 'Z');
        await knowledge.write('nested/b.md', '# B');
        await knowledge.write('a.md', '# A');

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents.map((document) => document.path)).toEqual([
            'a.md',
            'nested/b.md',
            'z.txt',
        ]);
    });

    it('忽略不支持的格式、隐藏文件和隐藏目录', async () => {
        await knowledge.write('visible.MD', '# 可见文档');
        await knowledge.write('image.png', '不是文档');
        await knowledge.write('.hidden.md', '# 隐藏文件');
        await knowledge.write('.private/secret.txt', '隐藏目录内容');

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents.map((document) => document.path)).toEqual(['visible.MD']);
    });

    it('不跟随指向知识库外部的文件或目录软链接', async () => {
        const outside = await createKnowledge();

        const outsideFile = await outside.write('secret.md', '# 外部内容');

        await knowledge.write('safe.md', '# 安全文档');

        await symlink(outsideFile, path.join(knowledge.root, 'linked.md'), 'file');
        await symlink(outside.root, path.join(knowledge.root, 'linked-directory'), 'dir');

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents.map((document) => document.path)).toEqual(['safe.md']);
        expect(JSON.stringify(result)).not.toContain('外部内容');
    });

    it('拒绝使用软链接作为知识库根目录', async () => {
        const target = await createKnowledge();
        const rootLink = path.join(knowledge.root, 'root-link');
        await symlink(target.root, rootLink, 'dir');

        await expect(loadKnowledgeDocuments(rootLink)).rejects.toMatchObject({ code: 'DOCUMENT_LOAD_ERROR' })
    });

    it('空目录返回明确的空加载结果', async () => {
        await expect(loadKnowledgeDocuments(knowledge.root),).resolves.toEqual({
            documents: [],
            diagnostics: [],
        });
    });

    it('跳过空文件和纯空白文件并返回诊断', async () => {
        await knowledge.write('empty.md', '');
        await knowledge.write('spaces.txt', ' \n\t ');
        await knowledge.write('valid.md', '# 有效文档');

        const result = await loadKnowledgeDocuments(knowledge.root);
        expect(result.documents.map((document) => document.path)).toEqual(['valid.md']);

        expect(result.diagnostics).toEqual([
            {
                code: 'EMPTY_DOCUMENT',
                path: 'empty.md',
                message: '文档为空，已跳过',
            },
            {
                code: 'EMPTY_DOCUMENT',
                path: 'spaces.txt',
                message: '文档为空，已跳过',
            },
        ]);

        expect(JSON.stringify(result.diagnostics)).not.toContain(knowledge.root);
    });

    it('知识库目录不存在时明确报错', async () => {
        await expect(
            loadKnowledgeDocuments(path.join(knowledge.root, 'missing'))
        ).rejects.toMatchObject({
            code: 'DOCUMENT_LOAD_ERROR',
        });
    });

    it('合法文档无法打开时整次加载失败且公开错误不泄漏内部信息', async () => {
        await knowledge.write('a.md', '# A');
        await knowledge.write('b.md', '# B');

        const original = new Error(`Cannot open ${knowledge.root}/b.md: private detail`)

        const openFile = vi.fn<typeof open>().mockRejectedValue(original);

        let caught: unknown;

        try {
            await loadKnowledgeDocuments(knowledge.root, { openFile });
        } catch (error: unknown) {
            caught = error;
        };

        expect(openFile).toHaveBeenCalledTimes(1);
        expect(caught).toMatchObject({
            code: 'DOCUMENT_LOAD_ERROR',
            cause: original,
        });

        const publicError = toPublicError(caught);
        expect(publicError).toEqual({
            code: 'DOCUMENT_LOAD_ERROR',
            message: '知识库文档加载失败，请检查文档配置后重试',
        });

        expect(JSON.stringify(publicError)).not.toContain(knowledge.root);
        expect(JSON.stringify(publicError)).not.toContain('private detail');
    });

    it('拒绝非法 UTF-8 而不使用替换字符掩盖解码错误', async () => {
        await knowledge.write('invalid.txt', new Uint8Array([0xc3, 0x28]));

        await expect(loadKnowledgeDocuments(knowledge.root)).rejects.toMatchObject({
            code: 'DOCUMENT_LOAD_ERROR',
        });
    });

    it('修改正文或迁移知识库根目录后文档 ID 保持稳定', async () => {
        await knowledge.write('guide.md', '# 旧内容');
        const first = await loadKnowledgeDocuments(knowledge.root);
        await knowledge.write('guide.md', '# 新内容');

        const second = await loadKnowledgeDocuments(knowledge.root);
        const anotherRoot = await createKnowledge();

        await anotherRoot.write(
            'guide.md',
            '# 另一台机器上的内容',
        );

        const third = await loadKnowledgeDocuments(anotherRoot.root);

        expect(second.documents[0].id).toBe(first.documents[0].id);
        expect(third.documents[0].id).toBe(first.documents[0].id);
        expect(second.documents[0].title).toBe('新内容');
    });

    it('不同子目录中的同名文件具有不同文档 ID', async () => {
        await knowledge.write('a/guide.md', '# A');
        await knowledge.write('b/guide.md', '# B');

        const result = await loadKnowledgeDocuments(knowledge.root);

        expect(result.documents).toHaveLength(2);
        expect(result.documents[0].id).not.toBe(result.documents[1].id);
    });

});
