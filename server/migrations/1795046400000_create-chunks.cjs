
exports.up = (pgm) => {
    pgm.sql(`
          ALTER TABLE rag_index_versions
            ADD CONSTRAINT version_id_dimension_unique
            UNIQUE (id, dimension);

        CREATE TABLE rag_chunks (
            version_id uuid NOT NULL,
            chunk_id text NOT NULL,
            document_id text NOT NULL,

            chunk_index integer NOT NULL
                CHECK (chunk_index >= 0),

            ordinal integer NOT NULL
                CHECK (ordinal >= 0),

            content text NOT NULL
                CHECK (btrim(content) <> ''),

            dimension integer NOT NULL
                CHECK (dimension > 0),

            embedding vector NOT NULL,

            CONSTRAINT chunk_primary_key
                PRIMARY KEY (version_id, chunk_id),

            CONSTRAINT chunk_position_unique
                UNIQUE (version_id, document_id, chunk_index),

            CONSTRAINT chunk_order_unique
                UNIQUE (version_id, ordinal),

            CONSTRAINT chunk_id_not_empty
                CHECK (btrim(chunk_id) <> ''),

            CONSTRAINT chunk_vector_dimension_matches
                CHECK (vector_dims(embedding) = dimension),

            CONSTRAINT chunk_references_document
                FOREIGN KEY (version_id, document_id)
                REFERENCES rag_documents (version_id, document_id)
                ON DELETE CASCADE,

            CONSTRAINT chunk_references_version_dimension
                FOREIGN KEY (version_id, dimension)
                REFERENCES rag_index_versions (id, dimension)
                ON DELETE CASCADE
        );
    `)
};

exports.down = () => {
    throw new Error('不自动删除 Chunk 与向量表，请通过后续迁移处理结构变更')   
}