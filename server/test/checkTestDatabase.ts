import { createTestDatabasePool } from './helpers/createTestDatabasePool';

async function main(): Promise<void> {
    const pool = await createTestDatabasePool(process.env.THOTH_TEST_DATABASE_URL);

    try {
        const result = await pool.query<{
            name: string;
            default_version: string;
        }>(
            `
            SELECT name, default_version
                FROM pg_available_extensions
                WHERE name = $1
            `,
            ['vector']
        );

        const extension = result.rows[0];

        if (!extension) {
            throw new Error('测试数据库不支持 vector 扩展');
        };

        console.log('测试数据库身份检查通过');
        console.log('可用拓展', extension);
    } finally {
        await pool.end();
    }
};


main().catch(() => {
    console.error('测试数据库检查失败，请检查专用测试配置和数据库运行状态');

    process.exitCode = 1;
});