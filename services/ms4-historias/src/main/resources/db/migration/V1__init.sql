CREATE TABLE historias_clinicas (
    id          UUID PRIMARY KEY,
    paciente_id UUID        NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version     BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE consultas (
    id           UUID PRIMARY KEY,
    historia_id  UUID        NOT NULL REFERENCES historias_clinicas (id),
    medico_id    UUID        NOT NULL,
    fecha        TIMESTAMPTZ NOT NULL,
    motivo       TEXT        NOT NULL,
    diagnostico  TEXT,
    tratamiento  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    version      BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX idx_consultas_historia ON consultas (historia_id, fecha DESC);

CREATE TABLE outbox (
    id             UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id   UUID         NOT NULL,
    event_type     VARCHAR(100) NOT NULL,
    payload        JSONB        NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pendientes ON outbox (created_at) WHERE published_at IS NULL;
