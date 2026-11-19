import { describe, expect, it } from 'vitest';

import { validateTestDatabaseUrl } from './helpers/testDatabaseConfig';


const TEST_URL = 'postgresql://thoth_test:example@127.0.0.1:5433/thoth_test';

describe('测试数据库连接保护', () => {
    it('接受约定的测试库地址，并移除首尾空白', () => {
        expect(
            validateTestDatabaseUrl(`  ${TEST_URL}  `)
        ).toBe(TEST_URL);
    });

    it('接受 localhost 和 postgres 协议', () => {
        const value = 'postgres://thoth_test:example@localhost:5433/thoth_test';

        expect(validateTestDatabaseUrl(value)).toBe(value);
    });

    it.each([undefined, '', '   '])(
        '缺少配置时明确失败：%s',
        (value) => {
            expect(() => validateTestDatabaseUrl(value)).toThrow('缺少测试数据库连接配置');
        }
    );

    it.each([
        // 完整开发库地址。
        'postgresql://thoth_dev:example@127.0.0.1:5432/thoth_dev',

        // 分别检查端口、数据库、用户和主机。
        'postgresql://thoth_test:example@127.0.0.1:5432/thoth_test',
        'postgresql://thoth_test:example@127.0.0.1:5433/thoth_dev',
        'postgresql://thoth_dev:example@127.0.0.1:5433/thoth_test',
        'postgresql://thoth_test:example@remote.example:5433/thoth_test',

        // 不接受额外连接参数或非法格式。
        `${TEST_URL}?host=other.example`,
        `${TEST_URL}#fragment`,
        'https://thoth_test:example@127.0.0.1:5433/thoth_test',
        'not-a-url',
    ])('拒绝不符合约定的地址：%s', (value) => {
        expect(() => validateTestDatabaseUrl(value)).toThrow('数据库测试只允许连接本机');
    });

    it('错误信息不泄露连接地址中的密码', () => {
        const secret = 'private-test-password';

        const run = () => validateTestDatabaseUrl(
            `postgresql://thoth_dev:${secret}@127.0.0.1:5432/thoth_dev`
        );

        expect(run).toThrow('数据库测试只允许连接本机');
        expect(run).not.toThrow(secret);
    });
})