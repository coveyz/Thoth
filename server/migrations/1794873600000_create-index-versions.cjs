
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TABLE rag_index_versions(
            id uuid PRIMARY KEY,
            status text NOT NULL
                CHECK (
                    status IN (
                        'building',
                        'ready',
                        'failed',
                        'interrupted'
                    )
                ),
            compatibility jsonb NOT NULL
                CHECK (jsonb_typeof(compatibility) = 'object'),

            dimension integer NOT NULL
                CHECK (dimension > 0),

            document_count integer
                CHECK (document_count >= 0),

            chunk_count integer
                CHECK (chunk_count >= 0),

            started_at timestamptz NOT NULL DEFAULT now(),
            finished_at timestamptz,

            failure_code text,
            failure_message text,

            CONSTRAINT version_completion_time CHECK (
                (status = 'building' AND finished_at IS NULL)
                OR
                (status <> 'building' AND finished_at IS NOT NULL)
            ),

            CONSTRAINT ready_version_has_counts CHECK (
                status <> 'ready'
                OR (
                    document_count IS NOT NULL
                    AND chunk_count IS NOT NULL
                )
            ),

            CONSTRAINT version_id_status_unique UNIQUE (id, status)
        );

        CREATE TABLE rag_index_head (
            id smallint PRIMARY KEY CHECK (id = 1),

            current_version_id uuid,

            version_status text NOT NULL DEFAULT 'ready'
                CHECK (version_status = 'ready'),

            CONSTRAINT head_references_ready_version
                FOREIGN KEY (current_version_id, version_status)
                REFERENCES rag_index_versions (id, status)
                ON DELETE RESTRICT
        );

        INSERT INTO rag_index_head (id, current_version_id)
        VALUES (1, NULL);
    `)
};

// 不能把卸载扩展当成普通撤销操作, 迁移明确只做前向升级
exports.down = () => {
    throw new Error('不自动删除索引版本表，通过后续迁移处理结构变更')   
}