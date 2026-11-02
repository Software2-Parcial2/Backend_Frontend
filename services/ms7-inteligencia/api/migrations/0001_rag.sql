-- RAG de MS7: documentos administrativos fragmentados con embeddings (pgvector).
-- La dimension (384) corresponde a sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2.
-- Cambiar de modelo con otra dimension exige una migracion nueva y reindexar.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_documentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta        text        NOT NULL UNIQUE,          -- ruta relativa dentro de docs/rag
  titulo      text        NOT NULL,
  version     text        NOT NULL,
  hash        text        NOT NULL,                 -- SHA-256 del contenido: evita reindexar lo que no cambio
  modelo      text        NOT NULL,                 -- modelo de embeddings usado
  indexado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rag_fragmentos (
  id           bigserial PRIMARY KEY,
  documento_id uuid        NOT NULL REFERENCES rag_documentos(id) ON DELETE CASCADE,
  seccion      text        NOT NULL,
  orden        integer     NOT NULL,
  texto        text        NOT NULL,
  embedding    vector(384) NOT NULL,
  UNIQUE (documento_id, orden)
);

-- Busqueda aproximada por similitud coseno (HNSW).
CREATE INDEX rag_fragmentos_embedding_hnsw ON rag_fragmentos USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX rag_fragmentos_documento_idx ON rag_fragmentos (documento_id);
