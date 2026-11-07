-- Fase 4: API de historias clinicas. Cambios ADITIVOS.
-- Deduplicacion de consumidores por id de mensaje (contracts/idempotency.md).
CREATE TABLE processed_messages (
    id           UUID PRIMARY KEY,
    status       VARCHAR(20) NOT NULL CHECK (status IN ('PROCESANDO', 'COMPLETADO')),
    locked_until TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_processed_messages_expires ON processed_messages (expires_at);

-- Datos de identificacion copiados de MS2 (paciente.creado / paciente.actualizado) para mostrarlos sin llamarlo.
ALTER TABLE historias_clinicas ADD COLUMN numero_historia VARCHAR(30);
ALTER TABLE historias_clinicas ADD COLUMN paciente_nombre VARCHAR(200);
CREATE UNIQUE INDEX historias_numero_unique ON historias_clinicas (numero_historia) WHERE numero_historia IS NOT NULL;
COMMENT ON COLUMN historias_clinicas.numero_historia IS 'Copia de MS2 pacientes.numero_historia';
COMMENT ON COLUMN historias_clinicas.paciente_nombre IS 'SENSIBLE: personal. Copia de MS2 pacientes.nombre';

-- Consulta: borrador -> firmada. Firmada no se edita (solo se anaden evoluciones).
ALTER TABLE consultas ADD COLUMN estado VARCHAR(10) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'FIRMADA'));
ALTER TABLE consultas ADD COLUMN indicaciones TEXT;
ALTER TABLE consultas ADD COLUMN receta JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE consultas ADD COLUMN firmada_en TIMESTAMPTZ;
ALTER TABLE consultas ADD COLUMN firmada_por VARCHAR(100);
ALTER TABLE consultas ADD CONSTRAINT consultas_firma_check CHECK ((estado = 'FIRMADA') = (firmada_en IS NOT NULL));
CREATE INDEX idx_consultas_estado ON consultas (historia_id, estado, fecha DESC);
COMMENT ON COLUMN consultas.indicaciones IS 'SENSIBLE: clinico';
COMMENT ON COLUMN consultas.receta IS 'SENSIBLE: clinico';
COMMENT ON COLUMN consultas.firmada_por IS 'sub de Keycloak del medico que firmo';

-- Proyeccion de citas (MS3): una consulta con cita solo se inicia si la cita esta confirmada o el paciente llego.
CREATE TABLE citas_proyeccion (
    cita_id     UUID PRIMARY KEY,
    paciente_id UUID        NOT NULL,
    medico_id   UUID        NOT NULL,
    fecha_hora  TIMESTAMPTZ NOT NULL,
    estado      VARCHAR(20) NOT NULL CHECK (estado IN ('CONFIRMADA', 'CANCELADA', 'LLEGO', 'ATENDIDA', 'NO_ASISTIO')),
    actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_citas_proyeccion_paciente ON citas_proyeccion (paciente_id, fecha_hora DESC);
COMMENT ON TABLE citas_proyeccion IS 'Proyeccion de eventos cita.* de MS3 (sin FK entre servicios)';

-- La purga tecnica tambien limpia los mensajes procesados vencidos.
DROP FUNCTION purgar_tecnico(INTERVAL);
CREATE FUNCTION purgar_tecnico(retencion_outbox INTERVAL DEFAULT INTERVAL '7 days')
RETURNS TABLE (outbox_borrados BIGINT, idempotencia_borrados BIGINT) LANGUAGE plpgsql AS $$
DECLARE o BIGINT; i BIGINT;
BEGIN
    DELETE FROM outbox WHERE published_at IS NOT NULL AND published_at < now() - retencion_outbox;
    GET DIAGNOSTICS o = ROW_COUNT;
    DELETE FROM idempotency_keys WHERE expires_at < now();
    GET DIAGNOSTICS i = ROW_COUNT;
    DELETE FROM processed_messages WHERE expires_at < now();
    RETURN QUERY SELECT o, i;
END $$;
