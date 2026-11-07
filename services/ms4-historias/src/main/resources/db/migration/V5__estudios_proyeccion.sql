-- Estudios de imagen con informe validado o descartado (proyeccion de imagen.informe-validado de MS5, sin FK entre servicios).
CREATE TABLE estudios_proyeccion (
    imagen_id      UUID PRIMARY KEY,
    paciente_id    UUID         NOT NULL,
    estudio        VARCHAR(100) NOT NULL,
    decision       VARCHAR(10)  NOT NULL CHECK (decision IN ('CONFIRMA', 'MODIFICA', 'DESCARTA')),
    validacion     VARCHAR(10)  NOT NULL CHECK (validacion IN ('VALIDADO', 'DESCARTADO')),
    medico_id      UUID,
    validado_en    TIMESTAMPTZ  NOT NULL,
    huella         CHAR(64)     NOT NULL,
    version_modelo VARCHAR(50)
);
CREATE INDEX idx_estudios_paciente ON estudios_proyeccion (paciente_id, validado_en DESC);
COMMENT ON TABLE estudios_proyeccion IS 'Proyeccion de imagen.informe-validado (MS5). El informe y la imagen se leen en MS5 por imagen_id';
COMMENT ON COLUMN estudios_proyeccion.paciente_id IS 'SENSIBLE: personal. Referencia a MS2 pacientes.id';
