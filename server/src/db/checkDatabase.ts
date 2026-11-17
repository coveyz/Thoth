import { loadEnv } from '../lib/env';
import { createDatabasePool } from './pool';

type DatabaseIdentity = {
    database: string;
    user: string;
};

async function main(): Promise<void> {
    const env = loadEnv();
    const connectionString = env.THOTH_DATABASE_URL;

    if (!connectionString) {
        throw new Error('缺少数据库连接配置');
    };

    const pool = createDatabasePool(connectionString);

    try {
        const result = await pool.query<DatabaseIdentity>(`
            SELECT
                current_database() AS database,
                current_user AS user
        `);

        console.log('数据库连接成功：', result.rows[0]);
    } finally {
        await pool.end();
    }
};

main().catch(() => {
    console.error('数据库检查失败，请检查连接配置和数据库运行状态');
    process.exitCode = 1;
});