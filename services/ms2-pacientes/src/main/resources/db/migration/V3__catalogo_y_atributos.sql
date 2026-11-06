-- Catalogo de especialidades y medicos, atributos del paciente para el modelo de inasistencia,
-- restricciones, y limpieza de tablas tecnicas. Cambios ADITIVOS: no rompe a V1/V2 ni al codigo existente.
-- Comentarios 'SENSIBLE: ...' alimentan el diccionario de datos (docs/datos/).

CREATE TABLE especialidades (
    id         UUID PRIMARY KEY,
    codigo     VARCHAR(40)  NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9_]+$'),
    nombre     VARCHAR(100) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
    activa     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE especialidades IS 'Catalogo de especialidades. MS3/MS6/MS4 la referencian por codigo (cadena en minusculas).';
COMMENT ON COLUMN especialidades.codigo IS 'Clave natural estable usada por MS3 (cita.especialidad) y MS6 (tarifas.especialidad)';

CREATE TABLE medicos (
    id               UUID PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
    documento        VARCHAR(30)  NOT NULL UNIQUE,
    matricula        VARCHAR(30)  NOT NULL UNIQUE,
    especialidad_id  UUID         NOT NULL REFERENCES especialidades (id),
    email            VARCHAR(200),
    telefono         VARCHAR(30),
    usuario_keycloak VARCHAR(100) UNIQUE,
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_medicos_especialidad ON medicos (especialidad_id) WHERE activo;
COMMENT ON TABLE medicos IS 'Medicos (dato maestro). MS3 los referencia por id en cita.medicoId; MS4 en consultas.medico_id.';
COMMENT ON COLUMN medicos.nombre IS 'SENSIBLE: personal';
COMMENT ON COLUMN medicos.documento IS 'SENSIBLE: personal';
COMMENT ON COLUMN medicos.matricula IS 'SENSIBLE: personal (registro profesional)';
COMMENT ON COLUMN medicos.email IS 'SENSIBLE: personal';
COMMENT ON COLUMN medicos.telefono IS 'SENSIBLE: personal';
COMMENT ON COLUMN medicos.usuario_keycloak IS 'preferred_username del usuario de Keycloak; une medico y usuario sin tocar el realm';

-- Atributos del paciente que hoy no se registran (el modelo de inasistencia de MS7 usaba valores neutros).
-- La edad no se guarda: se deriva de fecha_nacimiento.
ALTER TABLE pacientes ADD COLUMN beca BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pacientes ADD COLUMN tipo_seguro VARCHAR(20) NOT NULL DEFAULT 'NINGUNO'
    CONSTRAINT pacientes_tipo_seguro_check CHECK (tipo_seguro IN ('NINGUNO', 'PUBLICO', 'PRIVADO'));
ALTER TABLE pacientes ADD CONSTRAINT pacientes_nombre_check CHECK (char_length(btrim(nombre)) > 0);
ALTER TABLE pacientes ADD CONSTRAINT pacientes_nacimiento_check CHECK (fecha_nacimiento >= DATE '1900-01-01');

COMMENT ON COLUMN pacientes.nombre IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.documento IS 'SENSIBLE: personal (identificacion)';
COMMENT ON COLUMN pacientes.fecha_nacimiento IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.telefono IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.email IS 'SENSIBLE: personal';
COMMENT ON COLUMN pacientes.beca IS 'SENSIBLE: socioeconomico; alimenta el modelo de inasistencia de MS7';
COMMENT ON COLUMN pacientes.tipo_seguro IS 'SENSIBLE: socioeconomico; alimenta el modelo de inasistencia de MS7';

-- Retencion de tablas tecnicas (ver docs/datos/operacion.md). Se ejecuta con `make db-purge`.
CREATE INDEX idx_outbox_publicados ON outbox (published_at) WHERE published_at IS NOT NULL;

CREATE FUNCTION purgar_tecnico(retencion_outbox INTERVAL DEFAULT INTERVAL '7 days')
RETURNS TABLE (outbox_borrados BIGINT, idempotencia_borrados BIGINT) LANGUAGE plpgsql AS $$
DECLARE o BIGINT; i BIGINT;
BEGIN
    DELETE FROM outbox WHERE published_at IS NOT NULL AND published_at < now() - retencion_outbox;
    GET DIAGNOSTICS o = ROW_COUNT;
    DELETE FROM idempotency_keys WHERE expires_at < now();
    GET DIAGNOSTICS i = ROW_COUNT;
    RETURN QUERY SELECT o, i;
END $$;
