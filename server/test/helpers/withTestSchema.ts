import { randomUUID } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';


export async function withTestSchema(
    pool: Pool,
    run: (client: PoolClient, schema: string) => Promise<void>
) {
    const token = randomUUID();
    const schema = `thoth_test_${token.replaceAll('-', '_')}`;
    const marker = `thoth_test:${token}`;

    const client = await pool.connect();
    let created = false;

    try {
        // 创建 schema 和登记标记一起成功，或者一起回滚。
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA ${schema}`);
        await client.query(`COMMENT ON SCHEMA "${schema}" IS '${marker}'`);
        await client.query('COMMIT');

        created = true;

        await run(client, schema);
    } finally {
        try {
            // 防止测试留下未结束或已失败的事务，影响清理
            await client.query('ROLLBACK');

            if (created) {
                const ownership = await client.query(`
                    SELECT nspname
                    FROM pg_namespace
                    WHERE nspname = $1
                        AND obj_description(
                            oid, 'pg_namespace'
                        ) = $2
                        AND pg_get_userbyid(nspowner) = current_user
                `,
                    [schema, marker]
                );

                if (ownership.rows.length !== 1) {
                    throw new Error('测试 schema 所有权检查失败，拒绝清理');
                };

                await client.query(`DROP SCHEMA "${schema}" CASCADE`);
            };
        } finally {
            try {
                await client.query('RESET search_path');
            } catch(error) {
                // 恢复失败的连接不再交给其他使用者
                client.release(true);
                throw error;
            };
            client.release();
        }
    }

}