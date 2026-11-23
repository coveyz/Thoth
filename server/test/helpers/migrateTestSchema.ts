import * as path from 'node:path';

import type { PoolClient } from "pg";
import { runner } from 'node-pg-migrate';


export async function migrateTestSchema(client: PoolClient, schema: string) {
    if (!/^thoth_test_[0-9a-f_]{32,36}$/.test(schema)) {
        throw new Error('拒绝在非测试 schema 中执行迁移');
    };

    return runner({
        // 使用已经验证身份、已经借出的连接
        dbClient: client,
        // 执行项目真实迁移，不复制一套测试建表 SQL
        dir: path.resolve(__dirname, '../../migrations'),
        // 向上执行迁移
        direction: 'up',

        schema: [schema, 'public'],
        migrationsSchema: schema,
        migrationsTable: 'pgmigrations',

        createSchema: false,
        createMigrationsSchema: false,
        // 检查迁移文件是否按时间戳顺序运行
        checkOrder: true,
        // 所有迁移放在同一个事务里
        singleTransaction: true,

        // 测试失败由测试框架报告，减少迁移过程日志。
        log: () => { },
    });

}