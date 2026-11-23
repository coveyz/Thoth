import { describe, expect, it } from 'vitest';

import { createTestDatabasePool } from '../helpers/createTestDatabasePool';
import { withTestSchema } from '../helpers/withTestSchema';
import { migrateTestSchema } from '../helpers/migrateTestSchema';


const EXPECTED_MIGRATIONS = [
    '1794528000000_enable-vector',
    '1794873600000_create-index-versions',
    '1794960000000_create-documents',
    '1795046400000_create-chunks',
];

describe('真实数据库迁移', () => {
    it('全新 schema 完成迁移，重复执行不重跑，结束后正常清理', async () => {
        const pool = await createTestDatabasePool(
            process.env.THOTH_TEST_DATABASE_URL
        );

        let createdSchema = '';

        try {
            await withTestSchema(pool, async (client, schema) => {
                createdSchema = schema;

                const first = await migrateTestSchema(client, schema);

                expect(first.map((migration) => migration.name))
                    .toEqual(EXPECTED_MIGRATIONS);

                const tables = await client.query<{ table_name: string }>(
                    `
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = $1
                        AND table_type = 'BASE TABLE'
                        ORDER BY table_name
                    `,
                    [schema]
                );
                expect(tables.rows.map((row) => row.table_name))
                    .toEqual([
                        'pgmigrations',
                        'rag_chunks',
                        'rag_documents',
                        'rag_index_head',
                        'rag_index_versions',
                    ]);

                const head = await client.query(
                    `SELECT id, current_version_id, version_status
                    FROM "${schema}".rag_index_head`
                );
                expect(head.rows).toEqual([
                    {
                        id: 1,
                        current_version_id: null,
                        version_status: 'ready',
                    },
                ]);

                const extension = await client.query(
                    `SELECT extversion
                    FROM pg_extension
                    WHERE extname = $1`,
                    ['vector']
                );
                expect(extension.rows).toEqual([
                    { extversion: '0.8.0' },
                ]);

                const second = await migrateTestSchema(client, schema);
                expect(second).toEqual([]);

                const records = await client.query<{
                    name: string;
                }>(
                    `SELECT name
                    FROM "${schema}".pgmigrations
                    ORDER BY id`
                );
                expect(records.rows.map((row) => row.name))
                    .toEqual(EXPECTED_MIGRATIONS);
            });

            const remaining = await pool.query(
                `SELECT nspname
                FROM pg_namespace
                WHERE nspname = $1`,
                [createdSchema]
            );
            expect(remaining.rows).toEqual([]);
        } finally {
            await pool.end();
        };



    });
});