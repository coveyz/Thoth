import { createTestDatabasePool } from './helpers/createTestDatabasePool';
import { withTestSchema } from './helpers/withTestSchema';

async function main(): Promise<void> {
    const pool = await createTestDatabasePool(process.env.THOTH_TEST_DATABASE_URL);

    try {
        await withTestSchema(pool, async (client, schema) => {
            console.log('本次测试 schema:', schema);

            await client.query(`
                CREATE TABLE "${schema}".probe (
                    id integer PRIMARY KEY,
                    content text NOT NULL
                )
            `);

            await client.query(`
                INSERT INTO "${schema}".probe (id, content)
                    VALUES ($1, $2)
                `,
                [1, '测试数据']
            );

            const result = await client.query<{
                id: number;
                content: string;
            }>(
                `SELECT id, content FROM "${schema}".probe`
            );

            if (
                result.rows.length !== 1
                || result.rows[0]?.id !== 1
                || result.rows[0]?.content !== '测试数据'
            ) {
                throw new Error('测试数据读写结果不符合预期');
            };

            console.log('测试数据读写通过');
        });

        console.log('本次测试 schema 已清理');
    } finally {
        await pool.end();
    }
};


main().catch(() => {
    console.error(
        '测试数据库检查失败，请检查测试配置、数据库状态及清理结果'
    );

    process.exitCode = 1;
});