-- Auditoria persistente del agente de MS7 (antes solo en memoria). Sin datos de pacientes: los argumentos ya pasan por la redaccion/validacion zod.
CREATE TABLE agente_auditoria (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  en          timestamptz NOT NULL,
  usuario     text        NOT NULL,            -- sub de Keycloak
  roles       text[]      NOT NULL DEFAULT '{}',
  herramienta text        NOT NULL,
  argumentos  jsonb,
  estado      text        NOT NULL CHECK (estado IN ('ok', 'error', 'rechazada')),
  detalle     text,
  ms          integer     NOT NULL CHECK (ms >= 0),
  bytes       integer     NOT NULL CHECK (bytes >= 0)
);
-- Consulta del administrador (mas recientes primero) y limite de uso por usuario.
CREATE INDEX agente_auditoria_en_idx ON agente_auditoria (en DESC);
CREATE INDEX agente_auditoria_usuario_idx ON agente_auditoria (usuario, en DESC);

COMMENT ON COLUMN agente_auditoria.usuario IS 'SENSIBLE: personal (identificador del usuario de Keycloak)';
COMMENT ON COLUMN agente_auditoria.argumentos IS 'SENSIBLE: puede contener filtros de consulta; nunca datos clinicos';

-- Restricciones del RAG que faltaban en 0001.
ALTER TABLE rag_fragmentos ADD CONSTRAINT rag_fragmentos_orden_check CHECK (orden >= 0);
