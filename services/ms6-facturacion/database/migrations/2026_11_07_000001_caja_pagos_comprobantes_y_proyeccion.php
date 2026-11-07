<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fase 3 del plan de backend (caja): pagos con comprobante interno, numero de cargo, datos de la cita en la factura,
 * anulacion con motivo, tarifas con tipo y nombre, y proyeccion de nombres de paciente (alimentada por paciente.*).
 * Cambios ADITIVOS; el ledger (trigger) registra solo el nuevo estado PAGADA.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
-- Nuevo estado PAGADA (el cargo fue cobrado en caja).
ALTER TABLE facturas DROP CONSTRAINT facturas_estado_check;
ALTER TABLE facturas ADD CONSTRAINT facturas_estado_check CHECK (estado IN ('PENDIENTE','PROVISIONAL','CONFIRMADA','PAGADA','ANULADA'));

-- N.° de cargo legible (CG-20261103-0412): fecha local + secuencia. Lo asigna la base, tambien para INSERT directos y semillas.
-- IF NOT EXISTS + RESTART: `migrate:fresh` no borra secuencias sueltas.
CREATE SEQUENCE IF NOT EXISTS seq_cargo START 1;
ALTER SEQUENCE seq_cargo RESTART WITH 1;
ALTER TABLE facturas ADD COLUMN numero_cargo VARCHAR(24);
UPDATE facturas f SET numero_cargo = 'CG-' || to_char(f.created_at AT TIME ZONE 'America/La_Paz', 'YYYYMMDD') || '-' || to_char(n.num, 'FM0000')
  FROM (SELECT id, nextval('seq_cargo') AS num FROM (SELECT id FROM facturas ORDER BY created_at, id) o) n
 WHERE f.id = n.id;
ALTER TABLE facturas ALTER COLUMN numero_cargo SET NOT NULL;
ALTER TABLE facturas ALTER COLUMN numero_cargo SET DEFAULT ('CG-' || to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYYMMDD') || '-' || to_char(nextval('seq_cargo'), 'FM0000'));
ALTER TABLE facturas ADD CONSTRAINT facturas_numero_cargo_uk UNIQUE (numero_cargo);

ALTER TABLE facturas ADD COLUMN especialidad VARCHAR(40);
ALTER TABLE facturas ADD COLUMN fecha_cita TIMESTAMPTZ;
ALTER TABLE facturas ADD COLUMN motivo_anulacion VARCHAR(300);
ALTER TABLE facturas ADD COLUMN anulada_por VARCHAR(100);
ALTER TABLE facturas ADD COLUMN anulada_en TIMESTAMPTZ;
CREATE INDEX facturas_anulada_en_idx ON facturas (anulada_en) WHERE anulada_en IS NOT NULL;
CREATE INDEX facturas_pendientes_idx ON facturas (created_at) WHERE estado IN ('PENDIENTE','PROVISIONAL','CONFIRMADA');
COMMENT ON COLUMN facturas.numero_cargo IS 'N.° de cargo legible para caja (CG-AAAAMMDD-NNNN)';
COMMENT ON COLUMN facturas.especialidad IS 'Codigo de la especialidad de la cita (viene en el comando de la SAGA); permite ingresos por especialidad';
COMMENT ON COLUMN facturas.fecha_cita IS 'Fecha y hora de la cita que origino el cargo';
COMMENT ON COLUMN facturas.motivo_anulacion IS 'SENSIBLE: libre; no incluir datos clinicos';

-- Pagos: un cargo se cobra una sola vez. El comprobante es administrativo (no es una factura fiscal).
CREATE SEQUENCE IF NOT EXISTS seq_comprobante START 1;
ALTER SEQUENCE seq_comprobante RESTART WITH 1;
CREATE TABLE pagos (
    id                 UUID PRIMARY KEY,
    factura_id         UUID          NOT NULL UNIQUE REFERENCES facturas (id),
    metodo             VARCHAR(20)   NOT NULL CHECK (metodo IN ('EFECTIVO', 'TRANSFERENCIA', 'POS')),
    monto              NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
    recibido           NUMERIC(12,2) CHECK (recibido IS NULL OR recibido >= monto),
    cambio             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cambio >= 0),
    referencia         VARCHAR(100),
    cajero             VARCHAR(100)  NOT NULL,
    comprobante_numero VARCHAR(12)   NOT NULL UNIQUE DEFAULT ('CI-' || to_char(nextval('seq_comprobante'), 'FM000000')),
    pagado_en          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CHECK (metodo = 'EFECTIVO' OR referencia IS NOT NULL)
);
CREATE INDEX pagos_pagado_en_idx ON pagos (pagado_en);
COMMENT ON TABLE pagos IS 'Cobros registrados en caja (uno por cargo)';
COMMENT ON COLUMN pagos.referencia IS 'N.° de operacion (transferencia o POS)';
COMMENT ON COLUMN pagos.cajero IS 'preferred_username (o sub) del cajero que registro el cobro';

-- Tarifas: tipo (consulta o estudio) y nombre para mostrar.
ALTER TABLE tarifas ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'CONSULTA' CHECK (tipo IN ('CONSULTA', 'ESTUDIO'));
ALTER TABLE tarifas ADD COLUMN nombre VARCHAR(100);
COMMENT ON COLUMN tarifas.nombre IS 'Nombre para mostrar (p. ej. Radiografia de torax); si falta se usa el codigo';

-- Nombres de paciente para los listados de caja (sin llamar a MS2). Los escriben los eventos paciente.creado/actualizado.
CREATE TABLE pacientes_proyeccion (
    paciente_id     UUID PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    numero_historia VARCHAR(12),
    ocurrido_en     BIGINT       NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX pacientes_proyeccion_nombre_idx ON pacientes_proyeccion (lower(nombre) text_pattern_ops);
COMMENT ON TABLE pacientes_proyeccion IS 'Proyeccion local de MS2 (solo nombre y n.° de historia) para los listados de caja';
COMMENT ON COLUMN pacientes_proyeccion.nombre IS 'SENSIBLE: personal';
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS pacientes_proyeccion;
ALTER TABLE tarifas DROP COLUMN IF EXISTS nombre;
ALTER TABLE tarifas DROP COLUMN IF EXISTS tipo;
DROP TABLE IF EXISTS pagos;
DROP SEQUENCE IF EXISTS seq_comprobante;
DROP INDEX IF EXISTS facturas_pendientes_idx;
DROP INDEX IF EXISTS facturas_anulada_en_idx;
ALTER TABLE facturas DROP COLUMN IF EXISTS anulada_en;
ALTER TABLE facturas DROP COLUMN IF EXISTS anulada_por;
ALTER TABLE facturas DROP COLUMN IF EXISTS motivo_anulacion;
ALTER TABLE facturas DROP COLUMN IF EXISTS fecha_cita;
ALTER TABLE facturas DROP COLUMN IF EXISTS especialidad;
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_numero_cargo_uk;
ALTER TABLE facturas DROP COLUMN IF EXISTS numero_cargo;
DROP SEQUENCE IF EXISTS seq_cargo;
ALTER TABLE facturas DROP CONSTRAINT facturas_estado_check;
ALTER TABLE facturas ADD CONSTRAINT facturas_estado_check CHECK (estado IN ('PENDIENTE','PROVISIONAL','CONFIRMADA','ANULADA'));
SQL);
    }
};
