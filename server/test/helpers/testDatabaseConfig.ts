const CONFIG_ERROR = '数据库测试只允许连接本机 5433 端口的 thoth_test 数据库，用户必须为 thoth_test';

export function validateTestDatabaseUrl(raw: string | undefined): string {
    const value = raw?.trim();

    if (!value) {
        throw new Error('缺少测试数据库连接配置');
    };

    try {
        const url = new URL(value);

        /**
         * 本机，5433端口 -- 	对应当前 Compose 测试服务
         * 数据库， 用户都是 thoth_test -- 	防止误填开发配置
         * 不接受 查询参数 -- 	防止连接参数覆盖地址中的设置
         * 错误不包含原始地址 -- 	避免泄露密码
         */
        const allowed = ['postgres:', 'postgresql:'].includes(url.protocol)
            && ['127.0.0.1', 'localhost'].includes(url.hostname)
            && url.port === '5433'
            && url.pathname === '/thoth_test'
            && url.username === 'thoth_test'
            && url.search === ''
            && url.hash === '';

        if (!allowed) {
            throw new Error();
        };

        return value;
    } catch {
        throw new Error(CONFIG_ERROR);
    };
}


