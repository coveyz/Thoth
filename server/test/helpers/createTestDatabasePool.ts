import type { Pool } from "pg";

import { validateTestDatabaseUrl } from "./testDatabaseConfig";
import { createDatabasePool } from "../../src/db/pool";


type DatabaseIdentity = {
    database: string;
    user: string;
};

export async function createTestDatabasePool(raw: string | undefined): Promise<Pool> {
    const connectionString = validateTestDatabaseUrl(raw);
    const pool = createDatabasePool(connectionString);

    try {
        const result = await pool.query<DatabaseIdentity>(`
            SELECT
                current_database() AS database,
                current_user AS "user"
        `);

        const identity = result.rows[0];

        if (
            identity?.database !== 'thoth_test'
            || identity?.user !== 'thoth_test'
        ) {
            throw new Error('测试数据库身份不符合约定');
        }

        return pool;
    } catch {
        await pool.end();

        throw new Error('测试数据库连接或身份检查失败')
    }
};