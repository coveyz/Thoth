exports.up = (pgm) => {
    pgm.sql('CREATE EXTENSION IF NOT EXISTS vector;');
};

// 不能把卸载扩展当成普通撤销操作, 迁移明确只做前向升级
exports.down = () => {
    throw new Error('不自动卸载 vector 扩展，请通过后续迁移处理变更')   
}