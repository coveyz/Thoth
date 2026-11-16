import { Pool } from 'pg';

export function createDatabasePool(connectionString: string): Pool {
    const pool = new Pool({
        connectionString,
        // 连接池最多管理 5 个连接
        max: 5,
        // 等待取得连接最多 3 秒
        connectionTimeoutMillis: 3_000,
        // 空闲连接超过 10 秒后可以被关闭
        idleTimeoutMillis: 10_000,
        // 数据库执行一条 SQL 最多 5 秒
        statement_timeout: 5_000,
    })

    // 空闲连接也可能因数据库重启等原因发生错误
    // 必须监听；只输出固定文案，不公开连接信息
    pool.on('error', () => {
        console.error('数据库空闲连接发生错误');
    });

    return pool;
}