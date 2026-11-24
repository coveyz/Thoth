import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import { createTestDatabasePool } from '../helpers/createTestDatabasePool';
import { migrateTestSchema } from '../helpers/migrateTestSchema';
import { withTestSchema } from '../helpers/withTestSchema';


async function withDatabase(
    run: (client: PoolClient, schema: string) => Promise<void>
): Promise<void> {
    const pool = await createTestDatabasePool(process.env.THOTH_TEST_DATABASE_URL);

    try {
        await withTestSchema(pool, async (client, schema) => {
            await migrateTestSchema(client, schema);
            await run(client, schema);
        })
    } finally {
        await pool.end();
    }
};

describe('索引数据库约束', () => {
    it('head 拒绝不存在或未就绪的版本，并保留原指向', async () => {
        await withDatabase(async (client, schema) => {
            const versionA = randomUUID();
            const versionB = randomUUID();

            await client.query(
                `
                INSERT INTO "${schema}".rag_index_versions
                (id, status, compatibility, dimension)
                VALUES
                ($1, 'building', '{}', 2),
                ($2, 'building', '{}', 2)
                `,
                [versionA, versionB]
            );

            await client.query(
                `
                    UPDATE "${schema}".rag_index_versions
                    SET status = 'ready',
                        document_count = 0,
                        chunk_count = 0,
                        finished_at = now()
                    WHERE id = $1
                `,
                [versionA]
            );

            await client.query(
                `
                    UPDATE "${schema}".rag_index_head
                    SET current_version_id = $1
                    WHERE id = 1
                `,
                [versionA]
            );

            for (const invalidVersion of [versionB, randomUUID()]) {
                await expect(
                    client.query(
                        `
                            UPDATE "${schema}".rag_index_head
                            SET current_version_id = $1
                            WHERE id = 1
                        `,
                        [invalidVersion]
                    )
                ).rejects.toMatchObject({
                    code: '23503',
                    constraint: 'head_references_ready_version',
                });

                const head = await client.query(
                    `
                        SELECT current_version_id
                        FROM "${schema}".rag_index_head
                        WHERE id = 1
                    `
                );

                expect(head.rows).toEqual([
                    { current_version_id: versionA },
                ]);
            };

            // B 就绪后，同样的切换操作应该能够成功。
            await client.query(
                `
                    UPDATE "${schema}".rag_index_versions
                    SET status = 'ready',
                        document_count = 0,
                        chunk_count = 0,
                        finished_at = now()
                    WHERE id = $1
                `,
                [versionB]
            );

            await client.query(
                `
                    UPDATE "${schema}".rag_index_head
                    SET current_version_id = $1
                    WHERE id = 1
                `,
                [versionB]
            );

            const published = await client.query(
                `
                    SELECT current_version_id
                    FROM "${schema}".rag_index_head
                    WHERE id = 1
                `
            );

            expect(published.rows).toEqual([
                { current_version_id: versionB },
            ]);

        })
    });

    it('Chunk 拒绝两种维度矛盾，允许符合版本维度的数据', async () => {
        await withDatabase(async (client, schema) => {
            const version = randomUUID();

            await client.query(
                `
                    INSERT INTO "${schema}".rag_index_versions
                        (id, status, compatibility, dimension)
                    VALUES ($1, 'building', '{}', 2)
                `,
                [version]
            );

            await client.query(
                `
                    INSERT INTO "${schema}".rag_documents
                        (
                            version_id, document_id,
                            title, source, path, updated_at, content
                        )
                    VALUES (
                        $1, 'doc-a',
                        '测试文档', 'guide.md', 'guide.md',
                        now(), '完整文档正文'
                    )
                `,
                [version]
            );

            const insertChunk = (
                dimension: number,
                embedding: string
            ) => client.query(
                `
                    INSERT INTO "${schema}".rag_chunks
                        (
                            version_id, chunk_id, document_id,
                            chunk_index, ordinal, content,
                            dimension, embedding
                        )
                    VALUES (
                        $1, 'chunk-a', 'doc-a',
                        0, 0, '片段正文',
                        $2, $3::vector
                    )
                `,
                [version, dimension, embedding]
            );

            // 声明 2 维，实际 3 维：被 CHECK 拒绝。
            await expect(
                insertChunk(2, '[1,0,0]')
            ).rejects.toMatchObject({
                code: '23514',
                constraint: 'chunk_vector_dimension_matches',
            });

            // 声明和实际都是 3 维，但所属版本要求 2 维。
            await expect(
                insertChunk(3, '[1,0,0]')
            ).rejects.toMatchObject({
                code: '23503',
                constraint: 'chunk_references_version_dimension',
            });

            const rejectedCount = await client.query(
                `SELECT count(*)::integer AS count
                FROM "${schema}".rag_chunks`
            );

            expect(rejectedCount.rows).toEqual([{ count: 0 }]);

            // 三者都是 2 维：允许写入。
            await insertChunk(2, '[1,0]');

            const saved = await client.query(
                `
                    SELECT
                        content,
                        dimension,
                        embedding::text AS embedding
                    FROM "${schema}".rag_chunks
                `
            );

            expect(saved.rows).toEqual([
                {
                    content: '片段正文',
                    dimension: 2,
                    embedding: '[1,0]',
                },
            ]);
        });
    });
});