-- Claves de idempotencia (contracts/idempotency.md). "key" = <sub>:<Idempotency-Key>.
CREATE TABLE idempotency_keys (
    key           VARCHAR(300) PRIMARY KEY,
    request_hash  CHAR(64)     NOT NULL,
    status        VARCHAR(20)  NOT NULL CHECK (status IN ('PROCESANDO', 'COMPLETADO')),
    status_code   INTEGER,
    response_body TEXT,
    content_type  VARCHAR(100),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ  NOT NULL
);

CREATE INDEX idx_idempotency_keys_expires ON idempotency_keys (expires_at);
