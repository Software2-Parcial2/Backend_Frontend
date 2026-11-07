-- Fase 1 del plan de backend: datos que piden las pantallas (HC, sexo, direccion, version), busqueda fonetica,
-- contactos de emergencia, solicitudes de actualizacion del paciente y consultorio del medico.
-- Cambios ADITIVOS: no rompen a V1-V3.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalizacion fonetica para el castellano: sin tildes, minusculas, h/j iguales («Rohas» ~ «Rojas»), b/v, s/z/ce/ci, k/qu/ca/co/cu, ll/y.
CREATE FUNCTION sigec_fonetica(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(
                     translate(lower(unaccent('unaccent'::regdictionary, t)), 'hvzwñ', 'jbsun'),
                     'c([ei])', 's\1', 'g'),
                   'qu', 'k', 'g'),
                 'c', 'k', 'g'),
               'll', 'y', 'g'),
             'g([ei])', 'j\1', 'g')
$$;

CREATE SEQUENCE seq_numero_historia START 1;

ALTER TABLE pacientes ADD COLUMN numero_historia VARCHAR(12);
UPDATE pacientes p SET numero_historia = 'HC-' || lpad(n.num::text, 6, '0')
  FROM (SELECT id, nextval('seq_numero_historia') AS num FROM (SELECT id FROM pacientes ORDER BY created_at, id) o) n
 WHERE p.id = n.id;
ALTER TABLE pacientes ALTER COLUMN numero_historia SET NOT NULL;
-- Por defecto lo asigna la base: asi tambien funcionan las semillas y los INSERT directos (la aplicacion lo pide a la misma secuencia).
ALTER TABLE pacientes ALTER COLUMN numero_historia SET DEFAULT ('HC-' || lpad(nextval('seq_numero_historia')::text, 6, '0'));
ALTER TABLE pacientes ADD CONSTRAINT pacientes_numero_historia_uk UNIQUE (numero_historia);

ALTER TABLE pacientes ADD COLUMN sexo VARCHAR(5) CONSTRAINT pacientes_sexo_check CHECK (sexo IN ('F', 'M', 'OTRO'));
ALTER TABLE pacientes ADD COLUMN direccion VARCHAR(300);
ALTER TABLE pacientes ADD COLUMN usuario_sub VARCHAR(100) CONSTRAINT pacientes_usuario_sub_uk UNIQUE;
ALTER TABLE pacientes ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE pacientes ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE pacientes ADD COLUMN nombre_fonetico TEXT GENERATED ALWAYS AS (sigec_fonetica(nombre)) STORED;

CREATE INDEX idx_pacientes_nombre_trgm ON pacientes USING gin (nombre_fonetico gin_trgm_ops);
CREATE INDEX idx_pacientes_documento_pref ON pacientes (documento text_pattern_ops);
CREATE INDEX idx_pacientes_orden ON pacientes (nombre, id);

COMMENT ON COLUMN pacientes.numero_historia IS 'N.º de historia clinica (HC-000123): lo ven recepcion y medico; MS4 lo usa para vincular la historia';
COMMENT ON COLUMN pacientes.sexo IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.direccion IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.usuario_sub IS 'sub del usuario de Keycloak del paciente (portal); une paciente y cuenta sin tocar el realm';
COMMENT ON COLUMN pacientes.version IS 'Control de concurrencia optimista (If-Match / ETag)';
COMMENT ON COLUMN pacientes.nombre_fonetico IS 'Derivada de nombre con sigec_fonetica(); solo para busqueda';

CREATE TABLE contactos_emergencia (
    id          UUID PRIMARY KEY,
    paciente_id UUID         NOT NULL REFERENCES pacientes (id) ON DELETE CASCADE,
    nombre      VARCHAR(200) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
    parentesco  VARCHAR(60)  NOT NULL,
    telefono    VARCHAR(30)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_contactos_paciente ON contactos_emergencia (paciente_id);
COMMENT ON TABLE contactos_emergencia IS 'Contactos de emergencia de un paciente (sin limite de cantidad)';
COMMENT ON COLUMN contactos_emergencia.nombre IS 'SENSIBLE: personal de un tercero';
COMMENT ON COLUMN contactos_emergencia.telefono IS 'SENSIBLE: personal de un tercero';

-- El paciente pide cambiar un dato de contacto; recepcion aprueba o rechaza. Nombre y documento NO se solicitan por aqui.
CREATE TABLE solicitudes_actualizacion (
    id              UUID PRIMARY KEY,
    paciente_id     UUID         NOT NULL REFERENCES pacientes (id) ON DELETE CASCADE,
    campo           VARCHAR(20)  NOT NULL CHECK (campo IN ('telefono', 'email', 'direccion')),
    valor_actual    VARCHAR(300),
    valor_propuesto VARCHAR(300) NOT NULL CHECK (char_length(btrim(valor_propuesto)) > 0),
    estado          VARCHAR(12)  NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
    motivo_rechazo  VARCHAR(300),
    solicitada_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resuelta_en     TIMESTAMPTZ,
    resuelta_por    VARCHAR(100)
);
CREATE UNIQUE INDEX uk_solicitud_pendiente_por_campo ON solicitudes_actualizacion (paciente_id, campo) WHERE estado = 'PENDIENTE';
CREATE INDEX idx_solicitudes_estado ON solicitudes_actualizacion (estado, solicitada_en DESC);
COMMENT ON TABLE solicitudes_actualizacion IS 'Solicitudes de cambio de datos de contacto hechas por el paciente (portal)';
COMMENT ON COLUMN solicitudes_actualizacion.valor_actual IS 'SENSIBLE: personal';
COMMENT ON COLUMN solicitudes_actualizacion.valor_propuesto IS 'SENSIBLE: personal';

ALTER TABLE medicos ADD COLUMN consultorio VARCHAR(30);
COMMENT ON COLUMN medicos.consultorio IS 'Consultorio habitual (se muestra en la agenda)';
