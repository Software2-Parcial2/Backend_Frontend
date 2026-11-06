-- Antecedentes, evolucion clinica, consentimientos y auditoria de accesos. Cambios ADITIVOS.
-- Los comentarios 'SENSIBLE: ...' alimentan el diccionario de datos (docs/datos/). MS4 aun no expone API para estas tablas.

ALTER TABLE consultas ADD COLUMN cita_id UUID;
ALTER TABLE consultas ADD COLUMN signos_vitales JSONB;
ALTER TABLE consultas ADD CONSTRAINT consultas_version_check CHECK (version >= 0);
ALTER TABLE historias_clinicas ADD CONSTRAINT historias_version_check CHECK (version >= 0);
-- Una consulta por cita (cita_id NULL = atencion sin cita, p. ej. urgencias).
CREATE UNIQUE INDEX consultas_cita_unique ON consultas (cita_id) WHERE cita_id IS NOT NULL;
-- Agenda clinica del medico.
CREATE INDEX idx_consultas_medico ON consultas (medico_id, fecha DESC);

COMMENT ON COLUMN historias_clinicas.paciente_id IS 'Referencia a MS2 pacientes.id (sin FK entre bases)';
COMMENT ON COLUMN consultas.medico_id IS 'Referencia a MS2 medicos.id (sin FK entre bases)';
COMMENT ON COLUMN consultas.cita_id IS 'Referencia a MS3 CITA#<id> (sin FK entre servicios)';
COMMENT ON COLUMN consultas.motivo IS 'SENSIBLE: clinico';
COMMENT ON COLUMN consultas.diagnostico IS 'SENSIBLE: clinico';
COMMENT ON COLUMN consultas.tratamiento IS 'SENSIBLE: clinico';
COMMENT ON COLUMN consultas.signos_vitales IS 'SENSIBLE: clinico';

CREATE TABLE antecedentes (
    id          UUID PRIMARY KEY,
    historia_id UUID        NOT NULL REFERENCES historias_clinicas (id),
    tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('ALERGIA', 'PERSONAL', 'FAMILIAR', 'QUIRURGICO', 'MEDICACION')),
    descripcion TEXT        NOT NULL CHECK (char_length(btrim(descripcion)) > 0),
    activo      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version     BIGINT      NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE INDEX idx_antecedentes_historia ON antecedentes (historia_id, tipo);
COMMENT ON COLUMN antecedentes.descripcion IS 'SENSIBLE: clinico';

-- La evolucion clinica es inmutable: lo escrito no se reescribe, se anade una nota nueva.
CREATE TABLE evoluciones (
    id          UUID PRIMARY KEY,
    consulta_id UUID        NOT NULL REFERENCES consultas (id),
    medico_id   UUID        NOT NULL,
    fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
    nota        TEXT        NOT NULL CHECK (char_length(btrim(nota)) > 0)
);
CREATE INDEX idx_evoluciones_consulta ON evoluciones (consulta_id, fecha);
COMMENT ON COLUMN evoluciones.medico_id IS 'Referencia a MS2 medicos.id';
COMMENT ON COLUMN evoluciones.nota IS 'SENSIBLE: clinico';

CREATE TABLE consentimientos (
    id            UUID PRIMARY KEY,
    paciente_id   UUID         NOT NULL,
    tipo          VARCHAR(30)  NOT NULL CHECK (tipo IN ('TRATAMIENTO_DATOS', 'IMAGENES_IA', 'NOTIFICACIONES')),
    version_texto VARCHAR(20)  NOT NULL,
    otorgado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revocado_en   TIMESTAMPTZ,
    CHECK (revocado_en IS NULL OR revocado_en >= otorgado_en)
);
-- Un consentimiento vigente por paciente y tipo; los revocados se conservan (prueba legal).
CREATE UNIQUE INDEX consentimientos_vigente_unique ON consentimientos (paciente_id, tipo) WHERE revocado_en IS NULL;
COMMENT ON COLUMN consentimientos.paciente_id IS 'SENSIBLE: personal. Referencia a MS2 pacientes.id';

-- Auditoria de accesos a historias: solo ids y accion, NUNCA contenido clinico. Append-only.
CREATE TABLE auditoria_accesos (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    paciente_id UUID         NOT NULL,
    historia_id UUID,
    usuario_id  VARCHAR(100) NOT NULL,
    rol         VARCHAR(30)  NOT NULL,
    accion      VARCHAR(20)  NOT NULL CHECK (accion IN ('LEER', 'CREAR', 'MODIFICAR', 'EXPORTAR')),
    recurso     VARCHAR(40)  NOT NULL,
    ocurrido_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_paciente ON auditoria_accesos (paciente_id, ocurrido_en DESC);
CREATE INDEX idx_auditoria_fecha_brin ON auditoria_accesos USING brin (ocurrido_en);
COMMENT ON COLUMN auditoria_accesos.paciente_id IS 'SENSIBLE: personal (traza de acceso)';
COMMENT ON COLUMN auditoria_accesos.usuario_id IS 'sub de Keycloak';

CREATE FUNCTION rechazar_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% es de solo anadir: no se permite % (use una nota o registro nuevo)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER evoluciones_inmutable BEFORE UPDATE OR DELETE ON evoluciones FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria_accesos FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();

COMMENT ON TABLE historias_clinicas IS 'SENSIBLE: clinico (agregado de la historia)';

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
