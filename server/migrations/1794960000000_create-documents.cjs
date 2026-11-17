
//* rag_index_versions
//*   └─ rag_documents：保存本版本读取到的文档正文和 metadata

exports.up = (pgm) => {
    pgm.sql(`
        CREATE TABLE rag_documents (
            version_id uuid NOT NULL,
            document_id text NOT NULL,

            title text NOT NULL,
            source text NOT NULL,
            path text NOT NULL,
            updated_at timestamptz NOT NULL,
            content text NOT NULL,

            CONSTRAINT document_primary_key
                PRIMARY KEY (version_id, document_id),

            CONSTRAINT document_path_unique_per_version
                UNIQUE (version_id, path),

            CONSTRAINT document_references_version
                FOREIGN KEY (version_id)
                REFERENCES rag_index_versions (id)
                ON DELETE CASCADE,

            CONSTRAINT document_id_not_empty
                CHECK (btrim(document_id) <> ''),

            CONSTRAINT document_path_not_empty
                CHECK (btrim(path) <> ''),

            CONSTRAINT document_content_not_empty
                CHECK (btrim(content) <> '')
        )
    `);
};

exports.down = () => {
    throw new Error('不自动删除文档表，请通过后续迁移处理结构变更')   
};