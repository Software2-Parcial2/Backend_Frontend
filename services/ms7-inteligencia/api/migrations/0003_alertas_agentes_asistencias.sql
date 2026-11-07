-- Fase 7: alertas de gestion, agentes de monitoreo y asistencia real (para el modelo de inasistencia). Cambios ADITIVOS.

-- Asistencia registrada por MS3 (evento cita.asistencia-registrada). Una fila por cita: la reentrega del evento es un no-op.
CREATE TABLE asistencias (
    cita_id      uuid PRIMARY KEY,
    paciente_id  uuid        NOT NULL,
    medico_id    uuid,
    fecha_hora   timestamptz NOT NULL,
    asistencia   text        NOT NULL CHECK (asistencia IN ('LLEGO', 'ATENDIDA', 'NO_ASISTIO')),
    registrada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asistencias_paciente_idx ON asistencias (paciente_id, fecha_hora DESC);
COMMENT ON COLUMN asistencias.paciente_id IS 'SENSIBLE: personal. Referencia a MS2 pacientes.id (sin FK entre servicios)';

-- Los cuatro agentes que vigilan la clinica. La fila define su configuracion; el codigo define que miden.
CREATE TABLE agentes_monitoreo (
    id               text PRIMARY KEY CHECK (id IN ('cancelaciones', 'inasistencias', 'demanda', 'ingresos')),
    nombre           text        NOT NULL,
    descripcion      text        NOT NULL,
    activo           boolean     NOT NULL DEFAULT true,
    intervalo_min    integer     NOT NULL CHECK (intervalo_min BETWEEN 5 AND 1440),
    umbral           numeric(8, 3) NOT NULL CHECK (umbral > 0),
    ultima_ejecucion timestamptz,
    ultimo_estado    text        CHECK (ultimo_estado IN ('OK', 'ERROR')),
    ultimo_error     text,
    ultimas_alertas  integer     NOT NULL DEFAULT 0 CHECK (ultimas_alertas >= 0)
);
INSERT INTO agentes_monitoreo (id, nombre, descripcion, intervalo_min, umbral) VALUES
    ('cancelaciones', 'Cancelaciones', 'Tasa de citas canceladas en los ultimos 7 dias (umbral = proporcion, p. ej. 0.25)', 60, 0.25),
    ('inasistencias', 'Inasistencias', 'Citas de los proximos 3 dias con probabilidad de inasistencia alta (umbral = probabilidad minima)', 60, 0.5),
    ('demanda', 'Demanda', 'Especialidades cuya demanda semanal supera el promedio (umbral = multiplo del promedio)', 240, 1.5),
    ('ingresos', 'Ingresos', 'Caida de los ingresos confirmados de los ultimos 7 dias frente a los 7 anteriores (umbral = proporcion)', 240, 0.2);

CREATE TABLE alertas (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agente_id    text        NOT NULL REFERENCES agentes_monitoreo (id),
    clave        text        NOT NULL,
    nivel        text        NOT NULL CHECK (nivel IN ('BAJO', 'MEDIO', 'ALTO')),
    estado       text        NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'ATENDIDA')),
    titulo       text        NOT NULL,
    detalle      text        NOT NULL,
    datos        jsonb,
    creada_en    timestamptz NOT NULL DEFAULT now(),
    actualizada_en timestamptz NOT NULL DEFAULT now(),
    atendida_en  timestamptz,
    atendida_por text,
    nota         text,
    CHECK ((estado = 'ATENDIDA') = (atendida_en IS NOT NULL))
);
-- Una sola alerta abierta por clave: si la condicion persiste se refresca, no se duplica.
CREATE UNIQUE INDEX alertas_abierta_clave_uidx ON alertas (clave) WHERE estado = 'ABIERTA';
CREATE INDEX alertas_listado_idx ON alertas (creada_en DESC, id DESC);
CREATE INDEX alertas_estado_idx ON alertas (estado, creada_en DESC);
COMMENT ON COLUMN alertas.datos IS 'Cifras agregadas que originaron la alerta; ids de citas pero nunca datos clinicos';
COMMENT ON COLUMN alertas.atendida_por IS 'SENSIBLE: personal (usuario de Keycloak)';
