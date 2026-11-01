CREATE TABLE pacientes (
    id               UUID PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL,
    documento        VARCHAR(30)  NOT NULL UNIQUE,
    fecha_nacimiento DATE         NOT NULL,
    telefono         VARCHAR(30),
    email            VARCHAR(200),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

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
